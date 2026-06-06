import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../../middleware/account_auth.js'
import { getAdminPrefix } from '../../admin_prefix.js'
import { RuntimeSettings } from '../../runtime_settings.js'
import {
  resolveEffectiveRolesCatalog,
  SETTING_KEYS,
  type RoleCatalogEntry,
} from '../../runtime_toggles.js'

/** Regex de validação: nome de role — letras maiúsculas e underscore apenas. */
const ROLE_NAME_RE = /^[A-Z][A-Z0-9_]*$/

/** ADMIN é protegido: não pode ser removido nem renomeado. */
const PROTECTED_ROLE = 'ADMIN'

/**
 * Console admin — gestão do catálogo de roles globais.
 *
 * GET  /admin/roles             → lista do catálogo
 * POST /admin/roles             → criar nova role
 * POST /admin/roles/:name/edit  → editar descrição de uma role (ADMIN: só descrição)
 * POST /admin/roles/:name/delete → remover role (ADMIN: bloqueado)
 */
export default class AdminRolesController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
    const hasTable = !!db

    let catalog: RoleCatalogEntry[] = []
    if (hasTable) {
      const connection: string | undefined = (cfg.accountStore as any)?.connectionName
      const runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
      const resolved = await resolveEffectiveRolesCatalog(runtimeSettings)
      catalog = resolved.roles
    }

    return render(ctx, 'admin/roles', {
      csrfToken: ctx.request.csrfToken,
      adminBase: getAdminPrefix(),
      hasTable,
      catalog,
      flash: ctx.session.flashMessages.get('rolesFlash') ?? null,
      error: ctx.session.flashMessages.get('rolesError') ?? null,
    })
  }

  /** POST /admin/roles — cria nova role no catálogo. */
  async store(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const name = ((ctx.request.input('name', '') as string) ?? '').trim().toUpperCase()
    const description = ((ctx.request.input('description', '') as string) ?? '').trim()

    // Validação do nome.
    if (!name || !ROLE_NAME_RE.test(name)) {
      ctx.session.flash(
        'rolesError',
        cfg.messages['admin.roles.name_invalid'] ?? 'admin.roles.name_invalid'
      )
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
    if (!db) {
      ctx.session.flash(
        'rolesError',
        cfg.messages['admin.roles.no_settings_table'] ?? 'admin.roles.no_settings_table'
      )
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const connection: string | undefined = (cfg.accountStore as any)?.connectionName
    const runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
    const current = await resolveEffectiveRolesCatalog(runtimeSettings)

    // Unicidade case-insensitive.
    const exists = current.roles.some((r) => r.name.toUpperCase() === name)
    if (exists) {
      ctx.session.flash(
        'rolesError',
        cfg.messages['admin.roles.name_taken'] ?? 'admin.roles.name_taken'
      )
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const newEntry: RoleCatalogEntry = { name }
    if (description) newEntry.description = description

    const updatedRoles = [...current.roles, newEntry].sort((a, b) => a.name.localeCompare(b.name))

    await runtimeSettings.setSetting(
      SETTING_KEYS.ROLES_CATALOG,
      { roles: updatedRoles },
      actorId
    )

    await cfg.audit?.record({
      type: 'roles_catalog.updated',
      actorId,
      ip,
      metadata: { action: 'create', role: name },
    })

    ctx.session.flash('rolesFlash', cfg.messages['admin.roles.created'] ?? 'admin.roles.created')
    return ctx.response.redirect(`${getAdminPrefix()}/roles`)
  }

  /** POST /admin/roles/:name/edit — edita a descrição de uma role. */
  async update(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const roleName = decodeURIComponent(ctx.request.param('name') as string)
    const description = ((ctx.request.input('description', '') as string) ?? '').trim()

    const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
    if (!db) {
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const connection: string | undefined = (cfg.accountStore as any)?.connectionName
    const runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
    const current = await resolveEffectiveRolesCatalog(runtimeSettings)

    const updatedRoles = current.roles.map((r) =>
      r.name === roleName
        ? { name: r.name, ...(description ? { description } : {}) }
        : r
    )

    await runtimeSettings.setSetting(
      SETTING_KEYS.ROLES_CATALOG,
      { roles: updatedRoles },
      actorId
    )

    await cfg.audit?.record({
      type: 'roles_catalog.updated',
      actorId,
      ip,
      metadata: { action: 'edit', role: roleName },
    })

    ctx.session.flash('rolesFlash', cfg.messages['admin.roles.updated'] ?? 'admin.roles.updated')
    return ctx.response.redirect(`${getAdminPrefix()}/roles`)
  }

  /** POST /admin/roles/:name/delete — remove uma role do catálogo. */
  async destroy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const actorId = (ctx.session.get(ACCOUNT_SESSION_KEY) as string) ?? null
    const ip = ctx.request.ip?.() ?? null

    const roleName = decodeURIComponent(ctx.request.param('name') as string)

    // ADMIN é protegido.
    if (roleName === PROTECTED_ROLE) {
      ctx.session.flash(
        'rolesError',
        cfg.messages['admin.roles.admin_protected'] ?? 'admin.roles.admin_protected'
      )
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const db = await ctx.containerResolver.make('lucid.db').catch(() => null)
    if (!db) {
      return ctx.response.redirect(`${getAdminPrefix()}/roles`)
    }

    const connection: string | undefined = (cfg.accountStore as any)?.connectionName
    const runtimeSettings = new RuntimeSettings(db, connection ? { connection } : {})
    const current = await resolveEffectiveRolesCatalog(runtimeSettings)

    const updatedRoles = current.roles.filter((r) => r.name !== roleName)

    // Garante ADMIN sempre presente (merge defensivo).
    if (!updatedRoles.some((r) => r.name === PROTECTED_ROLE)) {
      updatedRoles.unshift({ name: PROTECTED_ROLE, description: 'Full access to the admin console' })
    }

    await runtimeSettings.setSetting(
      SETTING_KEYS.ROLES_CATALOG,
      { roles: updatedRoles },
      actorId
    )

    await cfg.audit?.record({
      type: 'roles_catalog.updated',
      actorId,
      ip,
      metadata: { action: 'delete', role: roleName },
    })

    ctx.session.flash('rolesFlash', cfg.messages['admin.roles.deleted'] ?? 'admin.roles.deleted')
    return ctx.response.redirect(`${getAdminPrefix()}/roles`)
  }
}
