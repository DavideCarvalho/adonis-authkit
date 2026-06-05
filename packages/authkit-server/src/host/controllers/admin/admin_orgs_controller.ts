import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../../middleware/account_auth.js'
import { AdminOrgsService } from '../../admin_api/admin_orgs_service.js'

/**
 * Console admin de organizações (B6). Server-rendered, mesmo padrão dos outros
 * controllers admin (admin_users_controller, etc.). Seção visível somente quando
 * `supportsOrganizations(store)`.
 */
export default class AdminOrgsController {
  /** GET /admin/orgs — lista todas as orgs com contagem de membros. */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const svc = new AdminOrgsService(cfg)
    if (!svc.supported) {
      return render(ctx, 'admin/orgs', {
        csrfToken: ctx.request.csrfToken,
        supported: false,
        orgs: [],
        error: null,
        success: null,
      })
    }

    const result = await svc.listOrgs()
    const orgs = Array.isArray(result) ? result : []

    return render(ctx, 'admin/orgs', {
      csrfToken: ctx.request.csrfToken,
      supported: true,
      orgs,
      error: ctx.session.flashMessages.get('orgsError') ?? null,
      success: ctx.session.flashMessages.get('orgsSuccess') ?? null,
    })
  }

  /** GET /admin/orgs/:id — detalhe da org com membros + convites. */
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const svc = new AdminOrgsService(cfg)
    const id = ctx.request.param('id')

    if (!svc.supported) {
      return ctx.response.redirect('/admin/orgs')
    }

    const result = await svc.getOrg(id)
    if ('ok' in result && result.ok === false) {
      return ctx.response.redirect('/admin/orgs')
    }

    const store = cfg.accountStore
    // Lista todas as contas para o dropdown de "adicionar membro"
    const accountsResult = await store.listAccounts({ page: 1, limit: 200 })

    return render(ctx, 'admin/org_detail', {
      csrfToken: ctx.request.csrfToken,
      org: result,
      accounts: accountsResult.data,
      availableRoles: cfg.organizations.roles,
      error: ctx.session.flashMessages.get('orgsError') ?? null,
      success: ctx.session.flashMessages.get('orgsSuccess') ?? null,
    })
  }

  /** POST /admin/orgs — cria uma org. */
  async store(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const svc = new AdminOrgsService(cfg)
    const name = (ctx.request.input('name', '') as string).trim()
    const slug = (ctx.request.input('slug', '') as string).trim()
    const ownerAccountId = (ctx.request.input('ownerAccountId', actorId ?? '') as string).trim()

    if (!name || !slug || !ownerAccountId) {
      ctx.session.flash('orgsError', cfg.messages['admin.orgs.invalid_input'] ?? 'admin.orgs.invalid_input')
      return ctx.response.redirect('/admin/orgs')
    }

    const result = await svc.createOrg(
      { name, slug, ownerAccountId },
      { actorId, ip, source: 'admin' }
    )

    if ('ok' in result && result.ok === false) {
      ctx.session.flash(
        'orgsError',
        result.reason === 'slug_taken'
          ? (cfg.messages['admin.orgs.slug_taken'] ?? 'admin.orgs.slug_taken')
          : (cfg.messages['admin.orgs.not_supported'] ?? 'admin.orgs.not_supported')
      )
      return ctx.response.redirect('/admin/orgs')
    }

    ctx.session.flash('orgsSuccess', cfg.messages['admin.orgs.created'] ?? 'admin.orgs.created')
    return ctx.response.redirect('/admin/orgs')
  }

  /** POST /admin/orgs/:id/delete — deleta a org. */
  async destroy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const svc = new AdminOrgsService(cfg)
    const id = ctx.request.param('id')

    await svc.deleteOrg(id, { actorId, ip, source: 'admin' })

    ctx.session.flash('orgsSuccess', cfg.messages['admin.orgs.deleted'] ?? 'admin.orgs.deleted')
    return ctx.response.redirect('/admin/orgs')
  }

  /** POST /admin/orgs/:id/members — adiciona membro. */
  async addMember(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const svc = new AdminOrgsService(cfg)
    const orgId = ctx.request.param('id')
    const accountId = (ctx.request.input('accountId', '') as string).trim()
    const role = (ctx.request.input('role', 'member') as string).trim()

    const result = await svc.addMember(orgId, { accountId, role }, { actorId, ip, source: 'admin' })

    if (!result.ok) {
      ctx.session.flash('orgsError', cfg.messages['admin.orgs.member_add_error'] ?? 'admin.orgs.member_add_error')
    } else {
      ctx.session.flash('orgsSuccess', cfg.messages['admin.orgs.member_added'] ?? 'admin.orgs.member_added')
    }
    return ctx.response.redirect(`/admin/orgs/${orgId}`)
  }

  /** POST /admin/orgs/:id/members/:accountId/remove — remove membro. */
  async removeMember(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const svc = new AdminOrgsService(cfg)
    const orgId = ctx.request.param('id')
    const accountId = ctx.request.param('accountId')

    const result = await svc.removeMember(orgId, accountId, { actorId, ip, source: 'admin' })

    if (!result.ok) {
      const msg = result.reason === 'last_owner'
        ? (cfg.messages['admin.orgs.last_owner'] ?? 'admin.orgs.last_owner')
        : (cfg.messages['admin.orgs.member_remove_error'] ?? 'admin.orgs.member_remove_error')
      ctx.session.flash('orgsError', msg)
    } else {
      ctx.session.flash('orgsSuccess', cfg.messages['admin.orgs.member_removed'] ?? 'admin.orgs.member_removed')
    }
    return ctx.response.redirect(`/admin/orgs/${orgId}`)
  }

  /** POST /admin/orgs/:id/invitations/:invId/revoke */
  async revokeInvitation(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const svc = new AdminOrgsService(cfg)
    const orgId = ctx.request.param('id')
    const invId = ctx.request.param('invId')

    await svc.revokeInvitation(orgId, invId, { actorId, ip, source: 'admin' })
    ctx.session.flash('orgsSuccess', cfg.messages['admin.orgs.invitation_revoked'] ?? 'admin.orgs.invitation_revoked')
    return ctx.response.redirect(`/admin/orgs/${orgId}`)
  }
}
