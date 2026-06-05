import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../../middleware/account_auth.js'
import { AdminSessionsService } from '../../admin_sessions_service.js'
import { enrichSessionsWithContext } from '../../session_context.js'
import { buildImpersonationPanel } from '../../impersonation.js'

/**
 * Inspeção/revogação das sessões e grants ativos de uma conta no console admin.
 * Lista as `Session` (logins do IdP) + os `Grant` (autorizações por client) da
 * conta, com a contagem de access/refresh tokens por grant. Degrada graciosamente
 * quando o adapter OIDC não enumera (`list`), espelhando o CRUD de clients.
 */
export default class AdminSessionsController {
  /** GET /admin/users/:id/sessions — lista sessões + grants da conta. */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const accountId = ctx.request.param('id')
    const account = await cfg.accountStore.findById(accountId)

    const sessions = new AdminSessionsService(service)
    const supported = sessions.canList

    const rawSessions = supported ? await sessions.listSessions(accountId) : []
    // Enriquece com contexto (UA→browser/SO + IP + geo) via join com o audit.
    const sessionList = await enrichSessionsWithContext(cfg, accountId, rawSessions)
    const grantList = supported ? await sessions.listGrants(accountId) : []

    const revoked = ctx.session.flashMessages.get('sessionsRevoked') as
      | { sessions: number; grants: number; accessTokens: number; refreshTokens: number }
      | undefined

    // Painel de impersonation (RFC 8693), só quando ligado no config (default OFF).
    // Acessar o painel é uma intenção de impersonation → audita `impersonation.started`.
    const impersonationEnabled = cfg.admin.impersonation
    let impersonation: ReturnType<typeof buildImpersonationPanel> = null
    if (impersonationEnabled) {
      impersonation = buildImpersonationPanel(cfg, accountId)
      await cfg.audit?.record({
        type: 'impersonation.started',
        accountId,
        actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
        ip: ctx.request.ip?.() ?? null,
        metadata: { clientId: impersonation?.clientId ?? null, channel: 'admin-panel' },
      })
    }

    return render(ctx, 'admin/sessions', {
      csrfToken: ctx.request.csrfToken,
      supported,
      accountId,
      email: account?.email ?? '',
      revoked: revoked ?? null,
      impersonationEnabled,
      impersonation,
      sessions: sessionList.map((s) => ({
        id: s.id,
        loginTs: s.loginTs ? new Date(s.loginTs * 1000).toISOString() : '',
        amr: (s.amr ?? []).join(', '),
        browser: s.browser ?? '',
        os: s.os ?? '',
        ip: s.ip ?? '',
        location: s.location ?? '',
      })),
      grants: grantList.map((g) => ({
        id: g.id,
        clientId: g.clientId ?? '',
        accessTokens: g.accessTokens,
        refreshTokens: g.refreshTokens,
      })),
    })
  }

  /** POST /admin/users/:id/revoke-sessions — destrói sessões + grants da conta. */
  async revoke(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const accountId = ctx.request.param('id')
    const sessions = new AdminSessionsService(service)
    const result = await sessions.revokeAll(accountId)

    await cfg.audit?.record({
      type: 'session.revoked_all',
      accountId,
      actorId: (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null,
      ip: ctx.request.ip?.() ?? null,
      metadata: {
        sessions: result.sessions,
        grants: result.grants,
        accessTokens: result.accessTokens,
        refreshTokens: result.refreshTokens,
      },
    })

    ctx.session.flash('sessionsRevoked', result)
    return ctx.response.redirect(`/admin/users/${accountId}/sessions`)
  }
}
