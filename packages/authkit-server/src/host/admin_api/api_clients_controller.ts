import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminClientsService } from '../admin_clients_service.js'
import type { ClientInput, TokenEndpointAuthMethod } from '../admin_clients_service.js'
import { clientDto, createdClientDto, apiError } from './dto.js'

/** Resolve o serviço (== OidcService) + o AdminClientsService. */
async function clientsService(ctx: HttpContext) {
  const service = await ctx.containerResolver.make('authkit.server')
  return { service, svc: new AdminClientsService(service) }
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

/** Aceita `grants` (== nome do dto de saída) como alias de `grantTypes` (entrada). */
function grantsInput(ctx: HttpContext): unknown {
  return ctx.request.input('grantTypes') ?? ctx.request.input('grants')
}

/** Input COMPLETO (create) — campos ausentes caem no default. */
function readInput(ctx: HttpContext): ClientInput {
  const backchannelUri = (ctx.request.input('backchannelLogoutUri') as string | undefined)?.trim()
  return {
    clientId: (ctx.request.input('clientId') as string | undefined)?.trim() || undefined,
    redirectUris: asArray(ctx.request.input('redirectUris')),
    postLogoutRedirectUris: asArray(ctx.request.input('postLogoutRedirectUris')),
    grantTypes: asArray(grantsInput(ctx)),
    tokenEndpointAuthMethod:
      (ctx.request.input('tokenEndpointAuthMethod', 'client_secret_basic') as TokenEndpointAuthMethod),
    backchannelLogoutUri: backchannelUri || undefined,
    backchannelLogoutSessionRequired:
      ctx.request.input('backchannelLogoutSessionRequired') === true ||
      ctx.request.input('backchannelLogoutSessionRequired') === 'true',
  }
}

/** Input PARCIAL (update/PATCH) — só inclui o que veio no body; o resto o service preserva. */
function readPartialInput(ctx: HttpContext): Partial<ClientInput> {
  const r = ctx.request
  const out: Partial<ClientInput> = {}
  if (r.input('redirectUris') !== undefined) out.redirectUris = asArray(r.input('redirectUris'))
  if (r.input('postLogoutRedirectUris') !== undefined)
    out.postLogoutRedirectUris = asArray(r.input('postLogoutRedirectUris'))
  if (grantsInput(ctx) !== undefined) out.grantTypes = asArray(grantsInput(ctx))
  if (r.input('tokenEndpointAuthMethod') !== undefined)
    out.tokenEndpointAuthMethod = r.input('tokenEndpointAuthMethod') as TokenEndpointAuthMethod
  if (r.input('backchannelLogoutUri') !== undefined)
    out.backchannelLogoutUri = (r.input('backchannelLogoutUri') as string | undefined)?.trim() || undefined
  if (r.input('backchannelLogoutSessionRequired') !== undefined)
    out.backchannelLogoutSessionRequired =
      r.input('backchannelLogoutSessionRequired') === true ||
      r.input('backchannelLogoutSessionRequired') === 'true'
  return out
}

/**
 * Recurso de clients OIDC da Admin REST API (R6). Reaproveita o
 * {@link AdminClientsService} (mesmo que o console B6). O secret é retornado UMA vez
 * em create/regenerate. Audita create/update/delete.
 */
export default class ApiClientsController {
  async index(ctx: HttpContext) {
    const { svc } = await clientsService(ctx)
    if (!svc.canList) {
      return { data: [], canList: false }
    }
    const clients = await svc.list()
    return { data: clients.map(clientDto), canList: true }
  }

  async show(ctx: HttpContext) {
    const { svc } = await clientsService(ctx)
    const client = await svc.find(ctx.request.param('id'))
    if (!client) return ctx.response.notFound(apiError('not_found', 'Client não encontrado.'))
    return clientDto(client)
  }

  async store(ctx: HttpContext) {
    const { service, svc } = await clientsService(ctx)
    const input = readInput(ctx)
    const created = await svc.create(input)
    await service.config.audit?.record({
      type: 'client.created',
      clientId: created.clientId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-api' },
    })
    ctx.response.status(201)
    return createdClientDto(created)
  }

  async update(ctx: HttpContext) {
    const { service, svc } = await clientsService(ctx)
    const id = ctx.request.param('id')
    const existing = await svc.find(id)
    if (!existing) return ctx.response.notFound(apiError('not_found', 'Client não encontrado.'))
    await svc.update(id, readPartialInput(ctx))
    await service.config.audit?.record({
      type: 'client.updated',
      clientId: id,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-api' },
    })
    const updated = await svc.find(id)
    return clientDto(updated!)
  }

  async regenerateSecret(ctx: HttpContext) {
    const { service, svc } = await clientsService(ctx)
    const id = ctx.request.param('id')
    try {
      const secret = await svc.regenerateSecret(id)
      await service.config.audit?.record({
        type: 'client.updated',
        clientId: id,
        ip: ctx.request.ip?.() ?? null,
        metadata: { actor: 'admin-api', action: 'regenerate_secret' },
      })
      return { clientId: id, clientSecret: secret }
    } catch (e) {
      return ctx.response.conflict(apiError('cannot_regenerate', (e as Error).message))
    }
  }

  async destroy(ctx: HttpContext) {
    const { service, svc } = await clientsService(ctx)
    const id = ctx.request.param('id')
    await svc.delete(id)
    await service.config.audit?.record({
      type: 'client.deleted',
      clientId: id,
      ip: ctx.request.ip?.() ?? null,
      metadata: { actor: 'admin-api' },
    })
    return { clientId: id, deleted: true }
  }
}
