import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminSessionsService } from '../admin_sessions_service.js'
import { enrichSessionsWithContext } from '../session_context.js'
import { sessionDto, grantDto, apiError } from '../admin_api/dto.js'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'

/**
 * Endpoints JSON de sessões/grants do console admin React.
 *
 * GET    {prefix}/api/sessions?accountId=  → lista sessões + grants de uma conta
 * DELETE {prefix}/api/sessions/:id         → revoga UMA sessão (não implementado no service — revoga all como fallback)
 * POST   {prefix}/api/sessions/revoke-all  → revoga todas as sessões de ?accountId=
 */
export default class ConsoleSessionsController {
  /** GET {prefix}/api/sessions?accountId= */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const accountId = (ctx.request.input('accountId', '') as string).trim()

    if (!accountId) {
      return ctx.response.badRequest(apiError('invalid_request', 'O parâmetro accountId é obrigatório.'))
    }

    const account = await cfg.accountStore.findById(accountId)
    if (!account) return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))

    const sessions = new AdminSessionsService(service)
    if (!sessions.canList) {
      return {
        supported: false,
        sessions: [],
        grants: [],
      }
    }

    const rawSessions = await sessions.listSessions(accountId)
    const enriched = await enrichSessionsWithContext(cfg, accountId, rawSessions)
    const grants = await sessions.listGrants(accountId)

    return {
      supported: true,
      sessions: enriched.map(sessionDto),
      grants: grants.map(grantDto),
    }
  }

  /** POST {prefix}/api/sessions/revoke-all?accountId= */
  async revokeAll(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session?.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const accountId = (
      (ctx.request.input('accountId', '') as string | undefined) ||
      (ctx.request.param('accountId') as string | undefined) ||
      ''
    ).trim()

    if (!accountId) {
      return ctx.response.badRequest(apiError('invalid_request', 'O parâmetro accountId é obrigatório.'))
    }

    const sessions = new AdminSessionsService(service)
    const result = await sessions.revokeAll(accountId)

    await cfg.audit?.record({
      type: 'session.revoked_all',
      accountId,
      actorId,
      ip,
      metadata: {
        sessions: result.sessions,
        grants: result.grants,
        accessTokens: result.accessTokens,
        refreshTokens: result.refreshTokens,
        source: 'admin-console',
      },
    })

    return { ok: true, ...result }
  }
}
