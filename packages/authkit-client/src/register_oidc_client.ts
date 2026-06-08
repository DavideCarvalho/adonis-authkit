import type { Router } from '@adonisjs/core/http'
import type { HttpContext } from '@adonisjs/core/http'
import type { Identity } from '@dudousxd/adonis-authkit-core'
import { randomUUID } from 'node:crypto'
import { buildAuthorizeUrl, buildEndSessionUrl, exchangeCode, generatePkce } from './oidc_login.js'

/**
 * Mapa role → rota de redirect pós-login. `byGlobalRole` checa as roles globais do
 * IdP (claim); `byAppRole` checa `resolveAppRoles`. A primeira correspondência vence
 * (global antes de app); sem match → `default`.
 */
export interface PostLoginRedirects {
  byGlobalRole?: Record<string, string>
  byAppRole?: Record<string, string>
  default?: string
}

export interface RegisterOidcClientOptions {
  /** Prefixo das rotas. Default `/auth` → `/auth/login`, `/auth/callback`, `/auth/logout`. */
  prefix?: string
  /**
   * Hook após troca de code bem-sucedida. Retorne uma STRING para redirecionar
   * para uma rota específica; retorne void para cair em `redirects`/`/`.
   */
  afterLogin?: (ctx: HttpContext, identity: Identity | null) => Promise<string | void> | string | void
  /** Redirect pós-login por papel (usado quando `afterLogin` não retorna string). */
  redirects?: PostLoginRedirects
  /** Destino pós-logout. Default: origem do redirectUri + '/'. */
  postLogoutRedirect?: string | ((ctx: HttpContext) => string)
  /** Registra também `POST {prefix}/backchannel-logout` (OIDC Back-Channel Logout). Default: true. */
  backchannelLogout?: boolean
  /**
   * Middleware(s) aplicados à rota de login (ex.: `middleware.guest()`). Array no
   * formato aceito por `.use()` do AdonisJS.
   */
  loginMiddleware?: any
  /** Query param repassado como hint ao authorize (ex.: `audience`). Default: `['audience']`. */
  passthroughParams?: string[]
}

/**
 * Registra as rotas OIDC de CLIENT (login/callback/logout [+ back-channel logout])
 * absorvendo o boilerplate que cada app reescrevia no OidcSessionController: PKCE +
 * state na sessão, troca de code, validação, logout RP-initiated e redirect por papel.
 *
 * ```ts
 * // start/routes.ts
 * import { registerOidcClient } from '@dudousxd/adonis-authkit-client'
 * registerOidcClient(router, {
 *   loginMiddleware: middleware.guest(),
 *   redirects: { byGlobalRole: { ADMIN: '/admin' }, byAppRole: { ADVISOR: '/advisor' }, default: '/' },
 * })
 * ```
 */
export function registerOidcClient(router: Router, options: RegisterOidcClientOptions = {}): void {
  const prefix = options.prefix ?? '/auth'
  const passthrough = options.passthroughParams ?? ['audience']
  const pkceKey = 'authkit_pkce'

  const loginRoute = router.get(`${prefix}/login`, async (ctx: HttpContext) => {
    const manager = await ctx.containerResolver.make('authkit.client')
    const cfg = manager.clientConfig
    const { verifier, challenge } = await generatePkce()
    const state = randomUUID()
    ;(ctx as any).session?.put(pkceKey, { verifier, state })

    const extraParams: Record<string, string> = {}
    for (const param of passthrough) {
      const v = ctx.request.input(param)
      if (v !== undefined && v !== null && v !== '') extraParams[param] = String(v)
    }

    const url = buildAuthorizeUrl({
      issuer: cfg.issuer,
      clientId: cfg.clientId,
      redirectUri: cfg.redirectUri,
      scopes: cfg.scopes,
      state,
      codeChallenge: challenge,
      ...(Object.keys(extraParams).length ? { extraParams } : {}),
    })
    return ctx.response.redirect(url)
  })
  if (options.loginMiddleware) loginRoute.use(options.loginMiddleware)
  loginRoute.as('auth.login')

  router
    .get(`${prefix}/callback`, async (ctx: HttpContext) => {
      const manager = await ctx.containerResolver.make('authkit.client')
      const cfg = manager.clientConfig
      const { code, state } = ctx.request.qs()
      const pkce = (ctx as any).session?.get(pkceKey)

      // Callback velho/expirado (state perdido ou code ausente) → recomeça o login.
      if (!pkce || pkce.state !== state || !code) {
        ;(ctx as any).session?.forget(pkceKey)
        return ctx.response.redirect(`${prefix}/login`)
      }

      const tokenSet = await exchangeCode({
        issuer: cfg.issuer,
        clientId: cfg.clientId,
        clientSecret: cfg.clientSecret,
        redirectUri: cfg.redirectUri,
        code,
        codeVerifier: pkce.verifier,
      })
      ;(ctx as any).session?.put(cfg.sessionKey, tokenSet)
      ;(ctx as any).session?.forget(pkceKey)

      const authenticator = await manager.createAuthenticator(ctx)
      const identity = await authenticator.getIdentity()

      // 1) Hook do app tem prioridade quando retorna uma rota.
      const hook = await options.afterLogin?.(ctx, identity)
      if (typeof hook === 'string') return ctx.response.redirect(hook)

      // 2) Redirect por papel: global primeiro, depois app.
      const dest = await resolveDestination(authenticator, identity, options.redirects)
      return ctx.response.redirect(dest)
    })
    .as('auth.callback')

  router
    .post(`${prefix}/logout`, async (ctx: HttpContext) => {
      const manager = await ctx.containerResolver.make('authkit.client')
      const cfg = manager.clientConfig
      const idToken = manager.getIdToken(ctx)
      ;(ctx as any).session?.forget(cfg.sessionKey)

      const postLogoutRedirectUri =
        typeof options.postLogoutRedirect === 'function'
          ? options.postLogoutRedirect(ctx)
          : (options.postLogoutRedirect ?? new URL(cfg.redirectUri).origin + '/')

      const endSessionUrl = buildEndSessionUrl({
        issuer: cfg.issuer,
        idToken,
        postLogoutRedirectUri,
        clientId: cfg.clientId,
      })
      return ctx.response.redirect(endSessionUrl)
    })
    .as('auth.logout')

  if (options.backchannelLogout !== false) {
    router
      .post(`${prefix}/backchannel-logout`, async (ctx: HttpContext) => {
        const manager = await ctx.containerResolver.make('authkit.client')
        return manager.handleBackchannelLogout(ctx)
      })
      .as('auth.backchannel_logout')
  }
}

/** Resolve o destino pós-login a partir do mapa de redirects por papel. */
async function resolveDestination(
  authenticator: { hasAppRole(role: string): Promise<boolean> },
  identity: Identity | null,
  redirects?: PostLoginRedirects
): Promise<string> {
  if (!redirects) return '/'
  const globalRoles = identity?.globalRoles ?? []
  if (redirects.byGlobalRole) {
    for (const [role, path] of Object.entries(redirects.byGlobalRole)) {
      if (globalRoles.includes(role)) return path
    }
  }
  if (redirects.byAppRole) {
    for (const [role, path] of Object.entries(redirects.byAppRole)) {
      if (await authenticator.hasAppRole(role)) return path
    }
  }
  return redirects.default ?? '/'
}
