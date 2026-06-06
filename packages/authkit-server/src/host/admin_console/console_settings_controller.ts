import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeSettings } from '../runtime_settings.js'
import { settingDto, apiError } from '../admin_api/dto.js'

async function getSettingsService(ctx: HttpContext): Promise<RuntimeSettings | null> {
  try {
    const db = await ctx.containerResolver.make('lucid.db')
    const service = await ctx.containerResolver.make('authkit.server').catch(() => null)
    const connection: string | undefined = (service?.config?.accountStore as any)?.connectionName
    return new RuntimeSettings(db, connection ? { connection } : {})
  } catch {
    return null
  }
}

function notSupported(ctx: HttpContext) {
  return ctx.response.notFound(
    apiError(
      'capability_unsupported',
      'Runtime settings não é suportado nesta instalação (tabela auth_settings ausente).'
    )
  )
}

/**
 * Endpoints JSON de runtime settings do console admin React.
 *
 * GET    {prefix}/api/settings      → todas as settings + metadados
 * PUT    {prefix}/api/settings/:key → upsert de uma setting
 * DELETE {prefix}/api/settings/:key → remover uma setting
 *
 * 404 honesto (`capability_unsupported`) quando a tabela auth_settings está ausente.
 */
export default class ConsoleSettingsController {
  /** GET {prefix}/api/settings */
  async index(ctx: HttpContext) {
    const svc = await getSettingsService(ctx)
    if (!svc) return notSupported(ctx)
    const tablePresent = await svc.isTablePresent()
    if (!tablePresent) return notSupported(ctx)
    const rows = await svc.listSettings()
    return { data: rows.map(settingDto) }
  }

  /** PUT {prefix}/api/settings/:key — body: { value: any } */
  async upsert(ctx: HttpContext) {
    const key = ctx.request.param('key') as string
    const body = ctx.request.body() as { value?: unknown }
    if (!body || !('value' in body)) {
      return ctx.response.badRequest(apiError('invalid_request', 'O campo `value` é obrigatório.'))
    }

    const svc = await getSettingsService(ctx)
    if (!svc) return notSupported(ctx)
    const tablePresent = await svc.isTablePresent()
    if (!tablePresent) return notSupported(ctx)

    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    await svc.setSetting(key, body.value, null)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: null,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key, value: body.value, source: 'admin-console' },
    })

    const saved = await svc.getSetting(key)
    return settingDto({ key, value: saved, updatedAt: new Date(), updatedBy: null })
  }

  /** DELETE {prefix}/api/settings/:key */
  async destroy(ctx: HttpContext) {
    const key = ctx.request.param('key') as string

    const svc = await getSettingsService(ctx)
    if (!svc) return notSupported(ctx)
    const tablePresent = await svc.isTablePresent()
    if (!tablePresent) return notSupported(ctx)

    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    await svc.deleteSetting(key)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: null,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key, action: 'deleted', source: 'admin-console' },
    })

    return { key, deleted: true }
  }
}
