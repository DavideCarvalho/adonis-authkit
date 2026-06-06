import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { translate } from '../i18n.js'
import { attemptPasswordLogin } from '../login_attempt.js'
import { notifyLoginSuccess } from '../login_notify.js'
import { markSudo } from '../sudo_mode.js'

/**
 * Valida um valor de `return_to` recebido da query-string ou de um campo hidden.
 *
 * Regras de segurança (anti open-redirect):
 *   - Deve ser uma string não-vazia.
 *   - Deve começar com `/`.
 *   - NÃO pode começar com `//` (esquema-relativo, ex.: `//evil.com`).
 *   - NÃO pode conter `://` (URL absoluta com esquema, ex.: `https://evil.com`).
 *
 * Retorna o valor validado ou `null` quando inválido/ausente.
 */
export function validateReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  if (value.includes('://')) return null
  return value
}

export default class AccountSessionController {
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    if (ctx.session.get(ACCOUNT_SESSION_KEY)) {
      return ctx.response.redirect('/account/tokens')
    }

    // Lê e valida o return_to da query-string — descarta valores inválidos (open-redirect).
    const rawReturnTo = (ctx.request as any).qs?.()?.return_to ?? ctx.request.input?.('return_to')
    const returnTo = validateReturnTo(rawReturnTo)

    return render(ctx, 'account/login', { csrfToken: ctx.request.csrfToken, returnTo })
  }

  async login(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const { email, password } = ctx.request.only(['email', 'password'])
    const ip = ctx.request.ip?.() ?? null

    // Lê e valida o return_to do corpo do formulário (hidden input) — nunca confiar sem revalidar.
    const rawReturnTo = ctx.request.input?.('return_to')
    const returnTo = validateReturnTo(rawReturnTo)

    // Verificação + lockout + auditoria de falha centralizados (sem clientId no console).
    const result = await attemptPasswordLogin(cfg, { email, password, ip })
    if (!result.ok) {
      return render(ctx, 'account/login', {
        csrfToken: ctx.request.csrfToken,
        returnTo,
        error: result.locked
          ? translate(cfg.messages, 'errors.account_locked', {
              seconds: result.retryAfterSec ?? 0,
            })
          : result.disabled
            ? translate(cfg.messages, 'errors.account_disabled')
            : translate(cfg.messages, 'errors.invalid_credentials'),
      })
    }

    const acc = result.account
    ctx.session.put(ACCOUNT_SESSION_KEY, acc.id)
    // Login com senha = confirmação de identidade → marca sudo (graça a partir do login).
    markSudo(ctx)
    await notifyLoginSuccess(ctx, cfg, { accountId: acc.id, email, ip })
    // Redireciona pro destino original (validado), ou cai no default /account/tokens.
    return ctx.response.redirect(returnTo ?? '/account/tokens')
  }

  async logout(ctx: HttpContext) {
    ctx.session.forget(ACCOUNT_SESSION_KEY)
    return ctx.response.redirect('/account/login')
  }
}
