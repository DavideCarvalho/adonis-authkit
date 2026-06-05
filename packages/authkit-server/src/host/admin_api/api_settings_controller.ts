import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeSettings } from '../runtime_settings.js'
import { settingDto, apiError } from './dto.js'

/** Helper: 404 JSON when settings capability is not available (table absent). */
function notSupported(ctx: HttpContext) {
  return ctx.response.notFound(
    apiError('capability_unsupported', 'Runtime settings não é suportado nesta instalação (tabela auth_settings ausente).')
  )
}

async function getSettingsService(ctx: HttpContext): Promise<RuntimeSettings | null> {
  try {
    const db = await ctx.containerResolver.make('lucid.db')
    return new RuntimeSettings(db)
  } catch {
    return null
  }
}

/**
 * CRUD de runtime settings da Admin REST API.
 * Todas as rotas ficam sob `/api/authkit/v1/settings`.
 * Retorna 404 (`capability_unsupported`) quando a tabela `auth_settings` não existe.
 */
export default class ApiSettingsController {
  /** GET /settings — lista todas as settings presentes. */
  async index(ctx: HttpContext) {
    const svc = await getSettingsService(ctx)
    if (!svc) return notSupported(ctx)
    // Probe table presence before returning list.
    const tablePresent = await svc.isTablePresent()
    if (!tablePresent) return notSupported(ctx)
    const rows = await svc.listSettings()
    return { data: rows.map(settingDto) }
  }

  /** GET /settings/:key — obtém uma setting por key. */
  async show(ctx: HttpContext) {
    const key = ctx.request.param('key') as string
    const svc = await getSettingsService(ctx)
    if (!svc) return notSupported(ctx)
    const tablePresent = await svc.isTablePresent()
    if (!tablePresent) return notSupported(ctx)
    const value = await svc.getSetting(key)
    if (value === null) {
      return ctx.response.notFound(apiError('not_found', 'Setting não encontrada.'))
    }
    return settingDto({ key, value, updatedAt: null, updatedBy: null })
  }

  /** PUT /settings/:key — cria ou atualiza uma setting. Body: { value: any } */
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
      metadata: { key, value: body.value },
    })

    const saved = await svc.getSetting(key)
    return settingDto({ key, value: saved, updatedAt: new Date(), updatedBy: null })
  }

  /** DELETE /settings/:key */
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
      metadata: { key, action: 'deleted' },
    })

    return { key, deleted: true }
  }
}
