import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { brandFor, isFirstParty } from '../branding.js'
import { translate } from '../i18n.js'
import { attemptPasswordLogin } from '../login_attempt.js'
import { notifyLoginSuccess } from '../login_notify.js'
import { supportsPasskeys } from '../../accounts/account_store.js'

const SESSION_KEY = 'authkit_login_email'
/** accountId aguardando o 2º fator depois da senha verificada. */
const MFA_PENDING_KEY = 'authkit_mfa_pending'
/** Desafio WebAuthn pendente (autenticação) guardado entre begin/finish no login. */
const PASSKEY_AUTH_CHALLENGE_KEY = 'authkit_passkey_auth_challenge'

export default class AuthInteractionController {
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )

    if (details.prompt.name === 'consent' && isFirstParty(cfg.branding!, details.params.client_id as string | undefined)) {
      // Clients first-party: auto-concede o consent (pula a tela de consent).
      // interactions.consent monta o Grant + interactionFinished e escreve o
      // redirect de volta para o client — opera via provider.interactionDetails,
      // independente do metodo HTTP, entao funciona no GET show().
      return await service.interactions.consent(ctx)
    }

    if (details.prompt.name !== 'login') {
      // Consent or other prompts — unchanged
      return render(ctx, 'consent', {
        uid: details.uid,
        params: details.params,
        csrfToken: ctx.request.csrfToken,
        brand,
      })
    }

    const email = ctx.session.get(SESSION_KEY) as string | undefined

    if (!email) {
      // Step 1: identifier (email only)
      return render(ctx, 'login', {
        uid: details.uid,
        csrfToken: ctx.request.csrfToken,
        step: 'identifier',
        brand,
      })
    }

    // Step 2: password — look up user for personalisation (enumeration-safe: always show step 2)
    const acc = await cfg.accountStore.findByEmail(email)
    const account = acc ? { fullName: acc.name ?? null, globalRoles: acc.globalRoles ?? [] } : null

    return render(ctx, 'login', {
      uid: details.uid,
      csrfToken: ctx.request.csrfToken,
      step: 'password',
      email,
      account,
      brand,
    })
  }

  /**
   * POST /auth/interaction/:uid/identifier
   * Step 1: receive email, store in session, redirect to step 2.
   * ENUMERATION-SAFE: always advances regardless of whether the email exists.
   */
  async identifier(ctx: HttpContext) {
    const { email } = ctx.request.only(['email'])
    ctx.session.put(SESSION_KEY, email)
    return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
  }

  /**
   * POST /auth/interaction/:uid/login
   * Step 2: password submit. Reads email from session (never from form).
   */
  async login(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const email = ctx.session.get(SESSION_KEY) as string | undefined
    if (!email) {
      // Session expired or tampered — send back to step 1
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    const { password } = ctx.request.only(['password'])
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    // Verificamos as credenciais ANTES de finalizar a interaction, porque com MFA
    // ligado precisamos exigir o 2º fator e NÃO podemos chamar interactionFinished
    // ainda. A sequência verificação + lockout + auditoria de falha é centralizada
    // em attemptPasswordLogin; a renderização (lookup p/ personalização) fica aqui.
    const result = await attemptPasswordLogin(cfg, { email, password, ip, clientId })

    if (!result.ok) {
      const found = await cfg.accountStore.findByEmail(email)
      const account = found
        ? { fullName: found.name ?? null, globalRoles: found.globalRoles ?? [] }
        : null
      return render(ctx, 'login', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        step: 'password',
        email,
        account,
        error: result.locked
          ? translate(cfg.messages, 'errors.account_locked', {
              seconds: result.retryAfterSec ?? 0,
            })
          : translate(cfg.messages, 'errors.invalid_credentials'),
        brand,
      })
    }

    const acc = result.account

    // MFA gate: se a conta tem TOTP ativo, NÃO finaliza a interaction agora —
    // guarda o accountId pendente na sessão e renderiza o desafio do 2º fator.
    const mfa = (await cfg.accountStore.getMfaState?.(acc.id)) ?? { enabled: false }
    if (mfa.enabled) {
      ctx.session.put(MFA_PENDING_KEY, acc.id)
      // Passkey disponível como alternativa ao TOTP se o store suporta E a conta
      // tem ao menos uma credencial registrada.
      const passkeyAvailable = await this.hasPasskeys(cfg, acc.id)
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        brand,
        passkeyAvailable,
      })
    }

    // Sem MFA: finaliza a interaction (escreve o 303 de volta para o client).
    await service.interactions.completeLogin(ctx, acc.id)
    await notifyLoginSuccess(ctx, cfg, { accountId: acc.id, email, ip, clientId })
    // Clean up the session key after a successful login.
    ctx.session.forget(SESSION_KEY)
  }

  /**
   * POST /auth/interaction/:uid/mfa
   * 2º fator: lê o accountId pendente da sessão e aceita um código TOTP (`code`)
   * OU um recovery code (`recoveryCode`). Em caso de sucesso finaliza a interaction.
   */
  async mfaVerify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const accountId = ctx.session.get(MFA_PENDING_KEY) as string | undefined
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    if (!accountId) {
      // Sessão expirou/foi adulterada — volta ao início do login.
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    const { code, recoveryCode } = ctx.request.only(['code', 'recoveryCode'])

    let ok = false
    let usedRecovery = false
    if (recoveryCode) {
      ok = (await cfg.accountStore.consumeRecoveryCode?.(accountId, recoveryCode)) ?? false
      usedRecovery = ok
    } else if (code) {
      ok = (await cfg.accountStore.verifyTotp?.(accountId, code)) ?? false
    }

    if (!ok) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId,
        ip,
        clientId,
        metadata: { stage: 'mfa' },
      })
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.invalid_code'),
        brand,
        passkeyAvailable: await this.hasPasskeys(cfg, accountId),
      })
    }

    // Sucesso no 2º fator: finaliza a interaction para o accountId pendente.
    ctx.session.forget(MFA_PENDING_KEY)
    ctx.session.forget(SESSION_KEY)
    await notifyLoginSuccess(ctx, cfg, {
      accountId,
      ip,
      clientId,
      metadata: { mfa: usedRecovery ? 'recovery' : 'totp' },
    })
    await service.interactions.completeLogin(ctx, accountId)
  }

  /** true se o store suporta passkeys E a conta tem ao menos uma registrada. */
  private async hasPasskeys(cfg: any, accountId: string): Promise<boolean> {
    if (!supportsPasskeys(cfg.accountStore)) return false
    const list = await cfg.accountStore.listPasskeys(accountId)
    return Array.isArray(list) && list.length > 0
  }

  /**
   * POST /auth/interaction/:uid/passkey/options
   * Gera as opções de autenticação por passkey para o accountId pendente do MFA,
   * guarda o challenge na sessão e devolve as opções JSON para o browser.
   */
  async passkeyOptions(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const accountId = ctx.session.get(MFA_PENDING_KEY) as string | undefined
    if (!accountId) {
      return ctx.response.badRequest({ message: 'Sessão expirada' })
    }
    const generated = await cfg.accountStore.generatePasskeyAuthenticationOptions?.(accountId)
    if (!generated) {
      return ctx.response.notFound({ message: 'Nenhuma passkey registrada' })
    }
    ctx.session.put(PASSKEY_AUTH_CHALLENGE_KEY, generated.challenge)
    return generated.options
  }

  /**
   * POST /auth/interaction/:uid/passkey/verify
   * Verifica a resposta de autenticação por passkey contra o challenge guardado;
   * em caso de sucesso FINALIZA a interaction (303 de volta ao client — alternativa
   * ao código TOTP). É um POST de página inteira (form), não fetch: o browser
   * submete o JSON da assertion no campo `response` e segue o redirect normalmente.
   */
  async passkeyVerify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const accountId = ctx.session.get(MFA_PENDING_KEY) as string | undefined
    const challenge = ctx.session.get(PASSKEY_AUTH_CHALLENGE_KEY) as string | undefined
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    if (!accountId || !challenge) {
      // Sessão expirou/foi adulterada — volta ao início do login.
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    // A assertion vem serializada como JSON no campo `response` do form.
    const raw = ctx.request.input('response') as string | undefined
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    const ok = parsed
      ? ((await cfg.accountStore.verifyPasskeyAuthentication?.(accountId, parsed, challenge)) ?? false)
      : false
    ctx.session.forget(PASSKEY_AUTH_CHALLENGE_KEY)

    if (!ok) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId,
        ip,
        clientId,
        metadata: { stage: 'mfa', method: 'webauthn' },
      })
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'mfa_challenge.passkey_error'),
        brand,
        passkeyAvailable: await this.hasPasskeys(cfg, accountId),
      })
    }

    ctx.session.forget(MFA_PENDING_KEY)
    ctx.session.forget(SESSION_KEY)
    await notifyLoginSuccess(ctx, cfg, {
      accountId,
      ip,
      clientId,
      metadata: { mfa: 'webauthn' },
    })
    await service.interactions.completeLogin(ctx, accountId)
  }

  /**
   * GET /auth/interaction/:uid/switch
   * Clears the stored email and redirects back to step 1.
   */
  async switchIdentifier(ctx: HttpContext) {
    ctx.session.forget(SESSION_KEY)
    return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
  }

  async consent(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    await service.interactions.consent(ctx)
  }
}
