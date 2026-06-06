import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminClientsService } from '../admin_clients_service.js'
import type { ClientInput, TokenEndpointAuthMethod } from '../admin_clients_service.js'
import { clientDto, createdClientDto, apiError } from '../admin_api/dto.js'

/** Parse um valor para array de strings não-vazio. */
function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function readInput(ctx: HttpContext): ClientInput {
  const backchannelUri = (ctx.request.input('backchannelLogoutUri') as string | undefined)?.trim()
  const authMethod = (
    ctx.request.input('tokenEndpointAuthMethod', 'client_secret_basic') as string
  ) as TokenEndpointAuthMethod
  return {
    clientId: (ctx.request.input('clientId') as string | undefined)?.trim() || undefined,
    redirectUris: asArray(ctx.request.input('redirectUris')),
    postLogoutRedirectUris: asArray(ctx.request.input('postLogoutRedirectUris')),
    grantTypes: asArray(ctx.request.input('grantTypes')),
    tokenEndpointAuthMethod: authMethod,
    backchannelLogoutUri: backchannelUri || undefined,
    backchannelLogoutSessionRequired:
      ctx.request.input('backchannelLogoutSessionRequired') === true ||
      ctx.request.input('backchannelLogoutSessionRequired') === 'true',
  }
}

/**
 * Endpoints JSON de clients OIDC do console admin React.
 *
 * GET    {prefix}/api/clients                 → lista clients dinâmicos
 * POST   {prefix}/api/clients                 → criar client (secret retornado UMA vez)
 * PATCH  {prefix}/api/clients/:id             → atualizar metadata
 * DELETE {prefix}/api/clients/:id             → remover client
 * POST   {prefix}/api/clients/:id/regenerate-secret → gerar novo secret
 */
export default class ConsoleClientsController {
  /** GET {prefix}/api/clients */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const svc = new AdminClientsService(service)
    if (!svc.canList) {
      return { data: [], canList: false }
    }
    const clients = await svc.list()
    return { data: clients.map(clientDto), canList: true }
  }

  /** POST {prefix}/api/clients */
  async store(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const svc = new AdminClientsService(service)
    const input = readInput(ctx)
    const created = await svc.create(input)

    await cfg.audit?.record({
      type: 'client.created',
      clientId: created.clientId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-console' },
    })

    ctx.response.status(201)
    return createdClientDto(created)
  }

  /** PATCH {prefix}/api/clients/:id */
  async update(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const svc = new AdminClientsService(service)
    const id = ctx.request.param('id') as string

    const existing = await svc.find(id)
    if (!existing) return ctx.response.notFound(apiError('not_found', 'Client não encontrado.'))

    await svc.update(id, readInput(ctx))

    await cfg.audit?.record({
      type: 'client.updated',
      clientId: id,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-console' },
    })

    const updated = await svc.find(id)
    return clientDto(updated!)
  }

  /** DELETE {prefix}/api/clients/:id */
  async destroy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const svc = new AdminClientsService(service)
    const id = ctx.request.param('id') as string

    const existing = await svc.find(id)
    if (!existing) return ctx.response.notFound(apiError('not_found', 'Client não encontrado.'))

    await svc.delete(id)

    await cfg.audit?.record({
      type: 'client.deleted',
      clientId: id,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-console' },
    })

    return { ok: true, deleted: id }
  }

  /** POST {prefix}/api/clients/:id/regenerate-secret */
  async regenerateSecret(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const svc = new AdminClientsService(service)
    const id = ctx.request.param('id') as string

    const existing = await svc.find(id)
    if (!existing) return ctx.response.notFound(apiError('not_found', 'Client não encontrado.'))

    let newSecret: string
    try {
      newSecret = await svc.regenerateSecret(id)
    } catch (err: any) {
      return ctx.response.status(409).send(apiError('not_applicable', err.message ?? 'Cannot regenerate secret for a public client.'))
    }

    await cfg.audit?.record({
      type: 'client.secret_regenerated',
      clientId: id,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-console' },
    })

    return { clientId: id, clientSecret: newSecret }
  }
}
