import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { AuthAccount } from '../../../accounts/account_store.js'
import { supportsAccountDeletion, supportsAccountStatus } from '../../../accounts/account_store.js'
import { ACCOUNT_SESSION_KEY } from '../../middleware/account_auth.js'
import { adminCreateUserValidator } from '../../validators.js'
import { AdminUsersService } from '../../admin_api/admin_users_service.js'
import { getAdminPrefix } from '../../admin_prefix.js'
import { RuntimeSettings } from '../../runtime_settings.js'
import { resolveEffectiveRolesCatalog, type RoleCatalogEntry } from '../../runtime_toggles.js'

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

    const store = cfg.accountStore
    const statusSupported = supportsAccountStatus(store)
    const deletionSupported = supportsAccountDeletion(store)
    // Resolve o estado de disabled por conta (só quando suportado).
    const disabledMap = new Map<string, boolean>()
    if (statusSupported) {
      for (const u of result.data) {
        disabledMap.set(u.id, await store.isDisabled(u.id))
      }
    }

    // Resolve o catálogo de roles para exibir checkboxes.
    let catalogRoles: RoleCatalogEntry[] = []
    try {
      const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
      if (db) {
        const connection: string | undefined = (store as any)?.connectionName
        const runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
        const catalog = await resolveEffectiveRolesCatalog(runtimeSettings)
        catalogRoles = catalog.roles
      }
    } catch {
      // fail-safe — catálogo vazio, a view cai para modo texto
    }

    const catalogRoleNames = new Set(catalogRoles.map((r) => r.name))

    return render(ctx, 'admin/users', {
      csrfToken: ctx.request.csrfToken,
      adminBase: getAdminPrefix(),
      search,
      page,
      totalPages,
      total: result.total,
      statusSupported,
      deletionSupported,
      catalogRoles,
      created: ctx.session.flashMessages.get('userCreated') ?? null,
      resetSent: ctx.session.flashMessages.get('resetSent') ?? null,
      statusChanged: ctx.session.flashMessages.get('statusChanged') ?? null,
      userDeleted: ctx.session.flashMessages.get('userDeleted') ?? null,
      error: ctx.session.flashMessages.get('usersError') ?? null,
      users: result.data.map((u: AuthAccount) => {
        const userRoles = u.globalRoles ?? []
        // Roles fora do catálogo: o usuário as tem, mas não estão no catálogo.
        const outOfCatalog = userRoles.filter((r) => !catalogRoleNames.has(r))
        return {
          id: u.id,
          email: u.email,
          name: u.name ?? '',
          roles: userRoles,
          rolesText: userRoles.join(', '),
          outOfCatalog,
          disabled: disabledMap.get(u.id) ?? false,
        }
      }),
    })
  }

  /**
   * POST /admin/users — cria uma conta. Se `password` for informado, a conta já
   * nasce com senha. Senão, emite um token de reset e envia o e-mail (o usuário
   * define a própria senha) — fluxo "create + invite". Audita `user.created`.
   */
  async store(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const { email, name, password } = await ctx.request.validateUsing(adminCreateUserValidator)

    const users = new AdminUsersService(cfg)
    const result = await users.create(ctx, { email, name, password }, { actorId, ip })
    if (!result.ok) {
      const flashKey =
        result.reason === 'password_policy' ? result.messageKey : 'errors.email_taken'
      ctx.session.flash('usersError', cfg.messages[flashKey] ?? flashKey)
      return ctx.response.redirect(`${getAdminPrefix()}/users`)
    }

    ctx.session.flash('userCreated', cfg.messages['admin.users.created'] ?? 'admin.users.created')
    return ctx.response.redirect(`${getAdminPrefix()}/users`)
  }

  /** POST /admin/users/:id/reset-password — emite token de reset + envia e-mail. */
  async resetPassword(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const accountId = ctx.request.param('id')
    await new AdminUsersService(cfg).resetPassword(ctx, accountId, { actorId, ip })
    ctx.session.flash('resetSent', cfg.messages['admin.users.reset_sent'] ?? 'admin.users.reset_sent')
    return this.#redirectBack(ctx)
  }

  /** POST /admin/users/:id/disable — desabilita a conta (bloqueia login). */
  async disable(ctx: HttpContext) {
    return this.#toggleStatus(ctx, true)
  }

  /** POST /admin/users/:id/enable — reabilita a conta. */
  async enable(ctx: HttpContext) {
    return this.#toggleStatus(ctx, false)
  }

  async #toggleStatus(ctx: HttpContext, disable: boolean) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const accountId = ctx.request.param('id')
    const applied = await new AdminUsersService(cfg).setStatus(accountId, disable, { actorId, ip })
    if (applied) {
      ctx.session.flash(
        'statusChanged',
        cfg.messages[disable ? 'admin.users.disabled' : 'admin.users.enabled'] ??
          (disable ? 'admin.users.disabled' : 'admin.users.enabled')
      )
    }
    return this.#redirectBack(ctx)
  }

  /** POST /admin/users/:id/delete — deleção completa (cascade) da conta. */
  async destroy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const accountId = ctx.request.param('id')
    const outcome = await new AdminUsersService(cfg).delete(service, accountId, {
      actorId,
      ip,
      source: 'admin',
    })
    if (outcome.ok) {
      ctx.session.flash('userDeleted', cfg.messages['admin.users.deleted'] ?? 'admin.users.deleted')
    } else {
      ctx.session.flash('usersError', cfg.messages['admin.users.delete_unsupported'] ?? 'admin.users.delete_unsupported')
    }
    return this.#redirectBack(ctx)
  }

  #redirectBack(ctx: HttpContext) {
    const search = (ctx.request.input('search', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (page > 1) qs.set('page', String(page))
    const query = qs.toString()
    return ctx.response.redirect(`${getAdminPrefix()}/users${query ? `?${query}` : ''}`)
  }

  async updateRoles(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    const accountId = ctx.request.param('id')

    // Aceita tanto checkboxes (array de 'roles[]') quanto campo de texto legado.
    const rolesInput = ctx.request.input('roles', []) as string | string[]
    let roles: string[]
    if (Array.isArray(rolesInput)) {
      // Formato checkbox: roles[] = ['ADMIN', 'EDITOR', ...]
      roles = Array.from(new Set(rolesInput.map((r) => r.trim()).filter((r) => r.length > 0)))
    } else {
      // Fallback: string separada por vírgula (legado — nunca enviado pela nova UI)
      roles = Array.from(
        new Set(
          (rolesInput as string)
            .split(',')
            .map((r) => r.trim())
            .filter((r) => r.length > 0)
        )
      )
    }

    // Valida contra o catálogo runtime (fail-safe quando não há tabela).
    let runtimeSettings: import('../../runtime_settings.js').RuntimeSettings | null = null
    try {
      const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
      if (db) {
        const connection: string | undefined = (cfg.accountStore as any)?.connectionName
        runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
      }
    } catch {
      // fail-safe
    }

    const users = new AdminUsersService(cfg)
    const errorKey = await users.setGlobalRolesValidated(accountId, roles, runtimeSettings)
    if (errorKey) {
      ctx.session.flash('usersError', cfg.messages[errorKey] ?? errorKey)
    }

    const search = (ctx.request.input('search', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (page > 1) qs.set('page', String(page))
    const query = qs.toString()
    return ctx.response.redirect(`${getAdminPrefix()}/users${query ? `?${query}` : ''}`)
  }
}
