import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { getAccountLoginUrl } from '../account_login_url.js'

export const ACCOUNT_SESSION_KEY = 'account_user_id'

export default class AccountAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string | undefined
    if (!userId) {
      // Destino configurável (`accountLoginUrl`): default `/account/login`.
      return ctx.response.redirect(getAccountLoginUrl())
    }
    return next()
  }
}
