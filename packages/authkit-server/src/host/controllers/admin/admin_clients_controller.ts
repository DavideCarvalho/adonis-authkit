import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { ClientConfig } from '@dudousxd/adonis-authkit-core'
import { ACCOUNT_SESSION_KEY } from '../../middleware/account_auth.js'
import {
  AdminClientsService,
  type ClientInput,
  type TokenEndpointAuthMethod,
} from '../../admin_clients_service.js'

const VALID_GRANTS = ['authorization_code', 'refresh_token', 'client_credentials']
const VALID_AUTH_METHODS: TokenEndpointAuthMethod[] = [
  'client_secret_basic',
  'client_secret_post',
  'none',
]

/** Normaliza um textarea (1 item por linha) numa lista sem vazios nem duplicatas. */
function parseLines(raw: unknown): string[] {
  return Array.from(
    new Set(
      String(raw ?? '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
    )
  )
}

/** Lê os grants marcados no form (checkboxes); cai no default quando nenhum. */
function parseGrants(ctx: HttpContext): string[] {
  const raw = ctx.request.input('grant_types', []) as string | string[]
  const arr = Array.isArray(raw) ? raw : [raw]
  const filtered = arr.filter((g) => VALID_GRANTS.includes(g))
  return filtered.length ? filtered : ['authorization_code', 'refresh_token']
}

function parseAuthMethod(ctx: HttpContext): TokenEndpointAuthMethod {
  const raw = ctx.request.input('token_endpoint_auth_method', 'client_secret_basic') as string
  return (VALID_AUTH_METHODS.includes(raw as TokenEndpointAuthMethod)
    ? raw
    : 'client_secret_basic') as TokenEndpointAuthMethod
}

function readInput(ctx: HttpContext): ClientInput {
  const backchannelUri = (ctx.request.input('backchannel_logout_uri', '') as string).trim()
  return {
    clientId: (ctx.request.input('client_id', '') as string).trim() || undefined,
    redirectUris: parseLines(ctx.request.input('redirect_uris')),
    postLogoutRedirectUris: parseLines(ctx.request.input('post_logout_redirect_uris')),
    grantTypes: parseGrants(ctx),
    tokenEndpointAuthMethod: parseAuthMethod(ctx),
    backchannelLogoutUri: backchannelUri || undefined,
    backchannelLogoutSessionRequired:
      ctx.request.input('backchannel_logout_session_required') === 'on',
  }
}

/**
 * CRUD de clients OIDC no console admin. Mostra os clients ESTÁTICOS da config
 * (somente leitura, rotulados) lado a lado com os clients DINÂMICOS persistidos
 * no adapter (registro dinâmico/RFC 7591 + os criados aqui). Quando o adapter não
 * suporta enumeração (`listClients`), a seção dinâmica degrada graciosamente —
 * espelhando o padrão da tela de auditoria.
 */
export default class AdminClientsController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const admin = new AdminClientsService(service)
    const dynamicSupported = admin.canList
    const dynamicClients = dynamicSupported ? await admin.list() : []

    const createdSecret = ctx.session.flashMessages.get('createdClientSecret') as
      | { clientId: string; clientSecret: string }
      | undefined

    return render(ctx, 'admin/clients', {
      csrfToken: ctx.request.csrfToken,
      dynamicEnabled: cfg.dynamicRegistration.enabled,
      dynamicSupported,
      createdSecret: createdSecret ?? null,
      staticClients: cfg.clients.map((c: ClientConfig) => ({
        clientId: c.clientId,
        confidential: !!c.clientSecret,
        grants: c.grants ?? ['authorization_code', 'refresh_token'],
        redirectUris: c.redirectUris ?? [],
        postLogoutRedirectUris: c.postLogoutRedirectUris ?? [],
      })),
      dynamicClients,
    })
  }

  /** Formulário de criação. */
  async create(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const render = service.config.render!
    return render(ctx, 'admin/client_form', {
      csrfToken: ctx.request.csrfToken,
      mode: 'create',
      client: {
        clientId: '',
        redirectUris: [],
        postLogoutRedirectUris: [],
        grants: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      },
    })
  }

  /** Persiste um client novo; mostra o secret UMA vez via flash. */
  async store(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const admin = new AdminClientsService(service)

    const input = readInput(ctx)
    const created = await admin.create(input)

    if (created.clientSecret) {
      ctx.session.flash('createdClientSecret', {
        clientId: created.clientId,
        clientSecret: created.clientSecret,
      })
    }
    await cfg.audit?.record({
      type: 'client.created',
      clientId: created.clientId,
      actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
      ip: ctx.request.ip?.() ?? null,
    })
    return ctx.response.redirect('/admin/clients')
  }

  /** Formulário de edição de um client persistido. */
  async edit(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const render = service.config.render!
    const admin = new AdminClientsService(service)

    const clientId = ctx.request.param('id')
    const client = await admin.find(clientId)
    if (!client) return ctx.response.redirect('/admin/clients')

    return render(ctx, 'admin/client_form', {
      csrfToken: ctx.request.csrfToken,
      mode: 'edit',
      client,
    })
  }

  /** Atualiza metadata editável (NÃO o secret). */
  async update(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const admin = new AdminClientsService(service)

    const clientId = ctx.request.param('id')
    const existing = await admin.find(clientId)
    if (!existing) return ctx.response.redirect('/admin/clients')

    const input = { ...readInput(ctx), clientId }
    await admin.update(clientId, input)

    await cfg.audit?.record({
      type: 'client.updated',
      clientId,
      actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
      ip: ctx.request.ip?.() ?? null,
    })
    return ctx.response.redirect('/admin/clients')
  }

  /** Regenera o secret de um client confidencial; mostra o novo valor UMA vez. */
  async regenerateSecret(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const admin = new AdminClientsService(service)

    const clientId = ctx.request.param('id')
    try {
      const secret = await admin.regenerateSecret(clientId)
      ctx.session.flash('createdClientSecret', { clientId, clientSecret: secret })
      await cfg.audit?.record({
        type: 'client.updated',
        clientId,
        actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
        ip: ctx.request.ip?.() ?? null,
        metadata: { action: 'regenerate_secret' },
      })
    } catch {
      // client inexistente ou public — sem secret a regenerar; volta silenciosamente.
    }
    return ctx.response.redirect('/admin/clients')
  }

  /** Remove um client persistido. */
  async destroy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const admin = new AdminClientsService(service)

    const clientId = ctx.request.param('id')
    await admin.delete(clientId)

    await cfg.audit?.record({
      type: 'client.deleted',
      clientId,
      actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
      ip: ctx.request.ip?.() ?? null,
    })
    return ctx.response.redirect('/admin/clients')
  }
}
