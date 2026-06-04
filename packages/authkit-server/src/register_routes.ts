import type { Router } from '@adonisjs/core/http'
import OidcCallbackController from './controllers/oidc_callback_controller.js'
import MetricsController from './observability/metrics_controller.js'

/**
 * Registra a rota catch-all que delega ao handler do oidc-provider.
 * O issuer do consumidor deve terminar em `mountPath` (default `/oidc`),
 * pois o oidc-provider roteia internamente sob o issuer.
 * Uso: registerOidcRoutes(router) no start/routes.ts do auth-service.
 *
 * Observabilidade (opt-in):
 * - `metrics: true` monta `GET /authkit/metrics` (snapshot JSON).
 * - `dashboard: true` monta `GET /authkit/dashboard` (HTML embutido).
 */
export function registerOidcRoutes(
  router: Router,
  options: { mountPath?: string; metrics?: boolean; dashboard?: boolean } = {}
) {
  const mount = options.mountPath ?? '/oidc'
  router.any(`${mount}/*`, [OidcCallbackController]).as('authkit.oidc.wildcard')
  router.any(mount, [OidcCallbackController]).as('authkit.oidc.root')
  if (options.metrics) router.get('/authkit/metrics', [MetricsController, 'json'])
  if (options.dashboard) router.get('/authkit/dashboard', [MetricsController, 'dashboard'])
}
