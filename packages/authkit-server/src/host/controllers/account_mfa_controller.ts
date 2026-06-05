import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import QRCode from 'qrcode'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { translate } from '../i18n.js'
import { supportsPasskeys } from '../../accounts/account_store.js'

/** Desafio WebAuthn pendente (registro) guardado na sessão entre begin/finish. */
const PASSKEY_REG_CHALLENGE_KEY = 'authkit_passkey_reg_challenge'

/**
 * Console de MFA da conta (atrás do account_auth middleware). Enrollment TOTP
 * com QR, confirmação com código, exibição única dos recovery codes e disable.
 */
export default class AccountMfaController {
  /** GET /account/mfa — estado atual; oferece enroll se desligado. */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const state = (await cfg.accountStore.getMfaState?.(userId)) ?? { enabled: false }
    const recoveryCodes = ctx.session.flashMessages.get('recoveryCodes') as string[] | undefined

    // Passkeys disponíveis quando o store as suporta (model de credenciais wired).
    const passkeysSupported = supportsPasskeys(cfg.accountStore)
    const passkeys = passkeysSupported ? await cfg.accountStore.listPasskeys(userId) : []

    return render(ctx, 'account/mfa', {
      csrfToken: ctx.request.csrfToken,
      enabled: state.enabled,
      recoveryCodes: recoveryCodes ?? null,
      passkeysSupported,
      passkeys,
    })
  }

  /**
   * POST /account/mfa/passkeys/options — gera as opções de registro de passkey
   * (JSON), guarda o challenge na sessão e devolve as opções para o browser.
   */
  async passkeyRegisterOptions(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const generated = await cfg.accountStore.generatePasskeyRegistrationOptions?.(userId)
    if (!generated) {
      return ctx.response.notFound({
        message: translate(cfg.messages, 'errors.passkeys_unavailable'),
      })
    }
    ctx.session.put(PASSKEY_REG_CHALLENGE_KEY, generated.challenge)
    return generated.options
  }

  /**
   * POST /account/mfa/passkeys/verify — verifica a resposta de registro do browser
   * contra o challenge guardado; em caso de sucesso persiste a credencial e habilita MFA.
   */
  async passkeyRegisterVerify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const challenge = ctx.session.get(PASSKEY_REG_CHALLENGE_KEY) as string | undefined
    if (!challenge) {
      return ctx.response.badRequest({
        message: translate(cfg.messages, 'errors.challenge_expired'),
      })
    }
    const body = ctx.request.input('response', ctx.request.body())
    const ok =
      (await cfg.accountStore.verifyPasskeyRegistration?.(userId, body, challenge)) ?? false
    ctx.session.forget(PASSKEY_REG_CHALLENGE_KEY)
    if (!ok) {
      return ctx.response.badRequest({ message: translate(cfg.messages, 'errors.invalid_code') })
    }
    await cfg.audit?.record({
      type: 'mfa.enabled',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { method: 'webauthn' },
    })
    await cfg.audit?.record({
      type: 'passkey.registered',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
    })
    return { ok: true }
  }

  /** POST /account/mfa/passkeys/:id/remove — remove uma passkey da conta. */
  async passkeyRemove(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const credentialId = ctx.request.param('id')
    await cfg.accountStore.removePasskey?.(userId, credentialId)
    await cfg.audit?.record({
      type: 'passkey.removed',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { credentialId },
    })
    return ctx.response.redirect('/account/mfa')
  }

  /** POST /account/mfa/enroll — gera segredo pendente + QR e mostra a confirmação. */
  async enroll(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const started = await cfg.accountStore.startTotpEnrollment?.(userId)
    if (!started) {
      return ctx.response.redirect('/account/mfa')
    }

    // QR renderizado server-side como data-URL e passado como prop.
    const qrDataUrl = await QRCode.toDataURL(started.otpauthUri)

    return render(ctx, 'account/mfa', {
      csrfToken: ctx.request.csrfToken,
      enabled: false,
      enrolling: true,
      secret: started.secret,
      qrDataUrl,
      recoveryCodes: null,
    })
  }

  /** POST /account/mfa/confirm — confirma o código; sucesso = ativa e mostra recovery codes. */
  async confirm(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const { code } = ctx.request.only(['code'])
    const result = (await cfg.accountStore.confirmTotpEnrollment?.(userId, code)) ?? { ok: false }

    if (!result.ok) {
      // Reenvia o passo de confirmação com erro SEM regenerar o segredo pendente
      // (o usuário já escaneou o QR; um novo segredo invalidaria o app autenticador).
      // Mostra só o campo de código para nova tentativa.
      return render(ctx, 'account/mfa', {
        csrfToken: ctx.request.csrfToken,
        enabled: false,
        enrolling: true,
        secret: null,
        qrDataUrl: null,
        error: translate(cfg.messages, 'errors.invalid_code'),
        recoveryCodes: null,
      })
    }

    await cfg.audit?.record({
      type: 'mfa.enabled',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
    })
    // Mostra os recovery codes UMA vez (flash) e volta pro estado "ativado".
    ctx.session.flash('recoveryCodes', result.recoveryCodes ?? [])
    return ctx.response.redirect('/account/mfa')
  }

  /** POST /account/mfa/disable — desliga o MFA. */
  async disable(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    await cfg.accountStore.disableMfa?.(userId)
    await cfg.audit?.record({
      type: 'mfa.disabled',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
    })
    return ctx.response.redirect('/account/mfa')
  }
}
