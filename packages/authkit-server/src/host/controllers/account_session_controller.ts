import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { translate } from '../i18n.js'
import { attemptPasswordLogin } from '../login_attempt.js'

export default class AccountSessionController {
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    if (ctx.session.get(ACCOUNT_SESSION_KEY)) {
      return ctx.response.redirect('/account/tokens')
    }
    return render(ctx, 'account/login', { csrfToken: ctx.request.csrfToken })
  }

  async login(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const { email, password } = ctx.request.only(['email', 'password'])
    const ip = ctx.request.ip?.() ?? null

    // Verificação + lockout + auditoria de falha centralizados (sem clientId no console).
    const result = await attemptPasswordLogin(cfg, { email, password, ip })
    if (!result.ok) {
      return render(ctx, 'account/login', {
        csrfToken: ctx.request.csrfToken,
        error: result.locked
          ? translate(cfg.messages, 'errors.account_locked', {
              seconds: result.retryAfterSec ?? 0,
            })
          : translate(cfg.messages, 'errors.invalid_credentials'),
      })
    }

    const acc = result.account
    ctx.session.put(ACCOUNT_SESSION_KEY, acc.id)
    await cfg.audit?.record({ type: 'login.success', accountId: acc.id, email, ip })
    return ctx.response.redirect('/account/tokens')
  }

  async logout(ctx: HttpContext) {
    ctx.session.forget(ACCOUNT_SESSION_KEY)
    return ctx.response.redirect('/account/login')
  }
}
