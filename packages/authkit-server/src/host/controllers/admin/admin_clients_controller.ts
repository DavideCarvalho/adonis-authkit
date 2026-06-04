import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { ClientConfig } from '@dudousxd/adonis-authkit-core'

/**
 * Listagem de OAuth clients. Mostra os clients ESTÁTICOS da config; clients
 * registrados dinamicamente (RFC 7591) vivem no adapter OIDC e não são listados
 * aqui — a view informa isso quando o registro dinâmico está ligado.
 */
export default class AdminClientsController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    return render(ctx, 'admin/clients', {
      csrfToken: ctx.request.csrfToken,
      dynamicEnabled: cfg.dynamicRegistration.enabled,
      clients: cfg.clients.map((c: ClientConfig) => ({
        clientId: c.clientId,
        confidential: !!c.clientSecret,
        grants: c.grants ?? ['authorization_code', 'refresh_token'],
        redirectUris: c.redirectUris ?? [],
        postLogoutRedirectUris: c.postLogoutRedirectUris ?? [],
      })),
    })
  }
}
