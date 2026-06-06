/**
 * Sudo mode — tela de confirmação de identidade (/account/confirm).
 *
 * GET  /account/confirm  → exibe o formulário de senha (e opção de passkey se disponível).
 * POST /account/confirm  → verifica a senha e, se correta, marca o sudo na sessão.
 * POST /account/confirm/passkey/options → gera as opções de autenticação.
 * POST /account/confirm/passkey         → verifica a resposta da passkey e marca o sudo.
 *
 * A tela está atrás do `accountGuard` (requer sessão de conta ativa).
 * Após confirmação, redireciona para `return_to` (validado) ou para `/account/tokens`.
 */

import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { translate } from '../i18n.js'
import { supportsPasskeys } from '../../accounts/account_store.js'
import { markSudo } from '../sudo_mode.js'
import { validateReturnTo } from './account_session_controller.js'

/** Chave de sessão para o challenge de passkey no confirm. */
const CONFIRM_PASSKEY_CHALLENGE_KEY = 'authkit_confirm_passkey_challenge'

export default class AccountConfirmController {
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const passkeyAvailable = supportsPasskeys(cfg.accountStore)
      ? (await cfg.accountStore.listPasskeys(userId)).length > 0
      : false

    // Conta passwordless: sem hash de senha (campo `password` vazio/null no model).
    // Verificamos indiretamente: verifyCredentials com senha fictícia vai falhar,
    // mas precisamos saber se a conta TEM senha. Abordagem: a conta é "passwordless"
    // se o store suporta passkeys, a conta tem pelo menos uma passkey E não tem
    // hash de senha — mas sem expor o hash, usamos uma flag do store se disponível.
    // Fallback conservador: assumimos que a conta tem senha se não soubermos.
    const passwordless = await this.isPasswordless(cfg, userId)

    const rawReturnTo = (ctx.request as any).qs?.()?.return_to ?? ctx.request.input?.('return_to')
    const returnTo = validateReturnTo(rawReturnTo)

    return render(ctx, 'account/confirm', {
      csrfToken: ctx.request.csrfToken,
      returnTo,
      error: ctx.session.flashMessages.get('confirmError') ?? null,
      passwordless,
      passkeyAvailable,
    })
  }

  async confirm(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const account = await cfg.accountStore.findById(userId)

    const rawReturnTo = ctx.request.input?.('return_to')
    const returnTo = validateReturnTo(rawReturnTo)

    const { password } = ctx.request.only(['password'])
    if (!password || !account) {
      ctx.session.flash('confirmError', translate(cfg.messages, 'account.confirm.error'))
      return ctx.response.redirect(`/account/confirm${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`)
    }

    const verified = await cfg.accountStore.verifyCredentials(account.email, password)
    if (!verified) {
      ctx.session.flash('confirmError', translate(cfg.messages, 'account.confirm.error'))
      return ctx.response.redirect(`/account/confirm${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`)
    }

    // Confirmado: marca o sudo na sessão.
    markSudo(ctx)

    await cfg.audit?.record({
      type: 'sudo.confirmed',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { method: 'password' },
    })

    return ctx.response.redirect(returnTo ?? '/account/tokens')
  }

  async passkeyOptions(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string

    const generated = await cfg.accountStore.generatePasskeyAuthenticationOptions?.(userId)
    if (!generated) {
      return ctx.response.notFound({
        message: translate(cfg.messages, 'errors.no_passkey_registered'),
      })
    }
    ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_KEY, generated.challenge)
    return generated.options
  }

  async passkeyConfirm(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const challenge = ctx.session.get(CONFIRM_PASSKEY_CHALLENGE_KEY) as string | undefined

    const rawReturnTo = ctx.request.input?.('return_to')
    const returnTo = validateReturnTo(rawReturnTo)

    if (!challenge) {
      ctx.session.flash('confirmError', translate(cfg.messages, 'account.confirm.passkey_error'))
      return ctx.response.redirect(`/account/confirm${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`)
    }

    const raw = ctx.request.input('response') as string | undefined
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }

    const ok = parsed
      ? ((await cfg.accountStore.verifyPasskeyAuthentication?.(userId, parsed, challenge)) ?? false)
      : false

    ctx.session.forget(CONFIRM_PASSKEY_CHALLENGE_KEY)

    if (!ok) {
      ctx.session.flash('confirmError', translate(cfg.messages, 'account.confirm.passkey_error'))
      return ctx.response.redirect(`/account/confirm${returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''}`)
    }

    // Passkey confirmada: marca o sudo.
    markSudo(ctx)

    await cfg.audit?.record({
      type: 'sudo.confirmed',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { method: 'passkey' },
    })

    return ctx.response.redirect(returnTo ?? '/account/tokens')
  }

  /**
   * Verifica se a conta é "passwordless" (sem hash de senha definido).
   * Fail-safe: retorna `false` quando não é possível determinar.
   */
  private async isPasswordless(cfg: any, accountId: string): Promise<boolean> {
    try {
      // Se o store expõe __getRawRow, verificamos se o hash de senha está vazio.
      const row = await cfg.accountStore.__getRawRow?.(accountId)
      if (row) {
        const pw = row.password
        // Hash vazio ou nulo → passwordless.
        if (!pw || pw === '') return true
      }
      return false
    } catch {
      return false
    }
  }
}
