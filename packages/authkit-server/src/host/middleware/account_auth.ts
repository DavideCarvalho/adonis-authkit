import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export const ACCOUNT_SESSION_KEY = 'account_user_id'

export default class AccountAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string | undefined
    if (!userId) {
      return ctx.response.redirect('/account/login')
    }
    return next()
  }
}
