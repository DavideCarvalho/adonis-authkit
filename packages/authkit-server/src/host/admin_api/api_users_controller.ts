import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { AuthAccount } from '../../accounts/account_store.js'
import { AdminUsersService } from './admin_users_service.js'
import { AdminSessionsService } from '../admin_sessions_service.js'
import { userDto, sessionDto, grantDto, apiError } from './dto.js'

const PAGE_SIZE = 20

/** Lê a config + monta o actor `admin-api` para auditoria. */
async function ctxBits(ctx: HttpContext) {
  const service = await ctx.containerResolver.make('authkit.server')
  const cfg = service.config
  const actor = { actorId: null, ip: ctx.request.ip?.() ?? null, source: 'admin-api' as const }
  return { service, cfg, actor }
}

/**
 * Recurso de usuários da Admin REST API (R6). JSON puro (camelCase), erros no
 * envelope `{ error: { code, message } }`. Toda escrita audita com `actor: 'admin-api'`.
 */
export default class ApiUsersController {
  /** GET /users — listagem paginada com busca por e-mail. */
  async index(ctx: HttpContext) {
    const { cfg } = await ctxBits(ctx)
    const search = (ctx.request.input('search', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)
    const limit = Math.max(1, Math.min(100, Number.parseInt(ctx.request.input('limit', String(PAGE_SIZE)), 10) || PAGE_SIZE))

    const result = await cfg.accountStore.listAccounts({ search, page, limit })
    const users = new AdminUsersService(cfg)
    const data = await Promise.all(
      result.data.map(async (u: AuthAccount) => userDto(u, await users.isDisabled(u.id)))
    )
    return { data, total: result.total, page, limit }
  }

  /** GET /users/:id */
  async show(ctx: HttpContext) {
    const { cfg } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const account = await cfg.accountStore.findById(id)
    if (!account) return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))
    const disabled = await new AdminUsersService(cfg).isDisabled(id)
    return userDto(account, disabled)
  }

  /** POST /users — { email, name?, password? | invite?:true }. */
  async store(ctx: HttpContext) {
    const { cfg, actor } = await ctxBits(ctx)
    const email = (ctx.request.input('email', '') as string).trim()
    const name = (ctx.request.input('name') as string | undefined) ?? null
    const password = (ctx.request.input('password') as string | undefined) ?? null
    const invite = ctx.request.input('invite') === true || ctx.request.input('invite') === 'true'

    if (!email) return ctx.response.badRequest(apiError('invalid_request', 'O campo email é obrigatório.'))

    const users = new AdminUsersService(cfg)
    const result = await users.create(ctx, { email, name, password, invite }, actor)
    if (!result.ok) {
      return ctx.response.conflict(apiError('email_taken', 'Já existe uma conta com este e-mail.'))
    }
    ctx.response.status(201)
    return { ...userDto(result.account), invited: result.invited }
  }

  /** PATCH /users/:id — { globalRoles?, name?, avatarUrl? }. */
  async update(ctx: HttpContext) {
    const { cfg } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const account = await cfg.accountStore.findById(id)
    if (!account) return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))

    const users = new AdminUsersService(cfg)
    const roles = ctx.request.input('globalRoles') as string[] | undefined
    if (Array.isArray(roles)) {
      const normalized = Array.from(new Set(roles.map((r) => String(r).trim()).filter(Boolean)))
      await users.setGlobalRoles(id, normalized)
    }

    const name = ctx.request.input('name') as string | null | undefined
    const avatarUrl = ctx.request.input('avatarUrl') as string | null | undefined
    if (name !== undefined || avatarUrl !== undefined) {
      const patch: { name?: string | null; avatarUrl?: string | null } = {}
      if (name !== undefined) patch.name = name
      if (avatarUrl !== undefined) patch.avatarUrl = avatarUrl
      await users.updateProfile(id, patch)
    }

    const updated = await cfg.accountStore.findById(id)
    return userDto(updated!, await users.isDisabled(id))
  }

  /** DELETE /users/:id — deleção completa (cascade) da conta. */
  async destroy(ctx: HttpContext) {
    const { service, cfg, actor } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const outcome = await new AdminUsersService(cfg).delete(service, id, actor)
    if (!outcome.ok) {
      if (outcome.reason === 'not_found') {
        return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))
      }
      return ctx.response.conflict(
        apiError('capability_unsupported', 'O store de contas não suporta deletar usuários.')
      )
    }
    return { id, deleted: true, ...outcome.result }
  }

  /** POST /users/:id/disable */
  async disable(ctx: HttpContext) {
    return this.#setStatus(ctx, true)
  }

  /** POST /users/:id/enable */
  async enable(ctx: HttpContext) {
    return this.#setStatus(ctx, false)
  }

  async #setStatus(ctx: HttpContext, disable: boolean) {
    const { cfg, actor } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const applied = await new AdminUsersService(cfg).setStatus(id, disable, actor)
    if (!applied) {
      return ctx.response.conflict(
        apiError('capability_unsupported', 'O store de contas não suporta habilitar/desabilitar.')
      )
    }
    return { id, disabled: disable }
  }

  /** POST /users/:id/reset-password — envia o e-mail de reset. */
  async resetPassword(ctx: HttpContext) {
    const { cfg, actor } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const account = await new AdminUsersService(cfg).resetPassword(ctx, id, actor)
    if (!account) return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))
    return { id, sent: true }
  }

  /** GET /users/:id/sessions — sessões + grants ativos. */
  async sessions(ctx: HttpContext) {
    const { service } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const admin = new AdminSessionsService(service)
    const sessions = await admin.listSessions(id)
    const grants = await admin.listGrants(id)
    return {
      canList: admin.canList,
      sessions: sessions.map(sessionDto),
      grants: grants.map(grantDto),
    }
  }

  /** POST /users/:id/revoke-sessions — revoga todas as sessões/grants. */
  async revokeSessions(ctx: HttpContext) {
    const { service, cfg, actor } = await ctxBits(ctx)
    const id = ctx.request.param('id')
    const result = await new AdminSessionsService(service).revokeAll(id)
    await cfg.audit?.record({
      type: 'session.revoked_all',
      accountId: id,
      actorId: actor.actorId,
      ip: actor.ip,
      metadata: { actor: actor.source, ...result },
    })
    return result
  }
}
