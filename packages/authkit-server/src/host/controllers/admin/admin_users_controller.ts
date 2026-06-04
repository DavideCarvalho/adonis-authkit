import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { AuthAccount } from '../../../accounts/account_store.js'

const PAGE_SIZE = 20

/**
 * Gestão de usuários do IdP: listagem paginada com busca por e-mail e edição das
 * roles globais de uma conta. As roles são informadas como texto separado por
 * vírgula no formulário e normalizadas aqui.
 */
export default class AdminUsersController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const search = (ctx.request.input('search', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)

    const result = await cfg.accountStore.listAccounts({ search, page, limit: PAGE_SIZE })
    const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

    return render(ctx, 'admin/users', {
      csrfToken: ctx.request.csrfToken,
      search,
      page,
      totalPages,
      total: result.total,
      users: result.data.map((u: AuthAccount) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? '',
        roles: u.globalRoles ?? [],
        rolesText: (u.globalRoles ?? []).join(', '),
      })),
    })
  }

  async updateRoles(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const accountId = ctx.request.param('id')
    const raw = (ctx.request.input('roles', '') as string) ?? ''
    // Normaliza: split por vírgula, trim, remove vazios e duplicatas.
    const roles = Array.from(
      new Set(
        raw
          .split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      )
    )

    await cfg.accountStore.setGlobalRoles(accountId, roles)

    const search = (ctx.request.input('search', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (page > 1) qs.set('page', String(page))
    const query = qs.toString()
    return ctx.response.redirect(`/admin/users${query ? `?${query}` : ''}`)
  }
}
