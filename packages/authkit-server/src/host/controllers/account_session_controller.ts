import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { translate } from '../i18n.js'
import { createAccountLockout } from '../account_lockout.js'

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
    const lockout = createAccountLockout(cfg.lockout)

    // Bloqueio progressivo: se a conta está travada, nem verifica a senha.
    const lock = await lockout.isLocked(email)
    if (lock.locked) {
      return render(ctx, 'account/login', {
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.account_locked', {
          seconds: lock.retryAfterSec ?? 0,
        }),
      })
    }

    const acc = await cfg.accountStore.verifyCredentials(email, password)
    if (!acc) {
      await cfg.audit?.record({ type: 'login.failure', email, ip })
      await lockout.recordFailure(email, { sink: cfg.audit, ip })
      return render(ctx, 'account/login', {
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.invalid_credentials'),
      })
    }
    await lockout.clearFailures(email)
    ctx.session.put(ACCOUNT_SESSION_KEY, acc.id)
    await cfg.audit?.record({ type: 'login.success', accountId: acc.id, email, ip })
    return ctx.response.redirect('/account/tokens')
  }

  async logout(ctx: HttpContext) {
    ctx.session.forget(ACCOUNT_SESSION_KEY)
    return ctx.response.redirect('/account/login')
  }
}
