import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export interface AuthMiddlewareOptions {
  /**
   * Papéis aceitos. Passa se o usuário tiver QUALQUER um deles como role global
   * (claim do IdP) OU como app role (`resolveAppRoles`). Vazio/ausente → só exige login.
   */
  roles?: string[]
  /** Para onde redirecionar quando não autenticado. Default: `/auth/login`. */
  redirectTo?: string
  /** Para onde redirecionar quando autenticado mas sem o papel exigido. Default: `/unauthorized`. */
  unauthorizedRedirect?: string
}

/**
 * Middleware de autenticação pronto do AuthKit: exige sessão válida (`ctx.auth.check()`)
 * e, opcionalmente, papéis (global OU app). Substitui o middleware de auth que cada
 * consumidor reescrevia à mão.
 *
 * ```ts
 * // start/kernel.ts
 * export const middleware = router.named({
 *   auth: () => import('@dudousxd/adonis-authkit-client/auth_middleware'),
 * })
 * // uso: .use(middleware.auth({ roles: ['ADVISOR'], redirectTo: '/auth/login' }))
 * ```
 */
export default class AuthkitAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: AuthMiddlewareOptions = {}) {
    const redirectTo = options.redirectTo ?? '/auth/login'

    const ok = await ctx.auth.check()
    if (!ok) return ctx.response.redirect(redirectTo)

    if (options.roles?.length) {
      const isGlobal = options.roles.some((r) => ctx.auth.hasGlobalRole(r))
      let allowed = isGlobal
      if (!allowed) {
        for (const r of options.roles) {
          if (await ctx.auth.hasAppRole(r)) {
            allowed = true
            break
          }
        }
      }
      if (!allowed) return ctx.response.redirect(options.unauthorizedRedirect ?? '/unauthorized')
    }

    return next()
  }
}
