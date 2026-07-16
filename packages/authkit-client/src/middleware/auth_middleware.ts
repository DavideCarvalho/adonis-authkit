import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export interface AuthMiddlewareOptions {
  /** Para onde redirecionar quando não autenticado. Default: `/auth/login`. */
  redirectTo?: string
}

/**
 * Middleware de autenticação do AuthKit: exige sessão válida. Autorização por role saiu daqui — use
 * `@adonis-agora/authz` (ou Bouncer) na rota. AuthKit só autentica.
 */
export default class AuthkitAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: AuthMiddlewareOptions = {}) {
    const ok = await ctx.auth.check()
    if (!ok) return ctx.response.redirect(options.redirectTo ?? '/auth/login')
    return next()
  }
}
