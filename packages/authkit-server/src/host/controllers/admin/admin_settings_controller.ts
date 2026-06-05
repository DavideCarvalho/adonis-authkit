import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeSettings } from '../../runtime_settings.js'
import { translate } from '../../i18n.js'

/** Best-effort: returns RuntimeSettings from container DB, or null if unavailable. */
async function getRuntimeSettings(ctx: HttpContext): Promise<RuntimeSettings | null> {
  try {
    const db = await ctx.containerResolver.make('lucid.db')
    return new RuntimeSettings(db)
  } catch {
    return null
  }
}

/**
 * Console admin — página de Settings em runtime.
 * GET  /admin/settings                  → exibe a página.
 * POST /admin/settings/bot-protection   → salva a setting bot_protection.
 * POST /admin/settings/bot-protection/reset → apaga a setting (volta ao config estático).
 */
export default class AdminSettingsController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const runtimeSettings = await getRuntimeSettings(ctx)
    const hasTable = runtimeSettings ? await runtimeSettings.isTablePresent() : false

    const hasBotConfig = !!cfg.botProtection
    let currentSetting: { enabled: boolean; on?: string[] } | null = null

    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('bot_protection')
      if (raw && typeof raw === 'object' && typeof (raw as any).enabled === 'boolean') {
        currentSetting = raw as { enabled: boolean; on?: string[] }
      }
    }

    // Effective values for the form (from setting if present, else from config).
    const configOn = cfg.botProtection?.on ?? ['login', 'signup']
    const formEnabled = currentSetting !== null ? currentSetting.enabled : true
    const formOn = currentSetting?.on ?? configOn

    return render(ctx, 'admin/settings', {
      csrfToken: ctx.request.csrfToken,
      flash: ctx.session?.flashMessages?.get?.('flash') ?? null,
      hasBotConfig,
      hasTable,
      formEnabled,
      formOn,
      configOn,
      currentSetting,
    })
  }

  async updateBotProtection(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect('/admin/settings')
    }

    const enabled = ctx.request.input('enabled') === '1' || ctx.request.input('enabled') === 'true'
    const rawOn = ctx.request.input('on')
    const on: string[] = Array.isArray(rawOn)
      ? rawOn
      : typeof rawOn === 'string'
        ? [rawOn]
        : []

    const setting = {
      enabled,
      ...(on.length > 0 ? { on } : {}),
    }

    await runtimeSettings.setSetting('bot_protection', setting, accountId)

    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'bot_protection', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect('/admin/settings')
  }

  async resetBotProtection(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('bot_protection')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'bot_protection', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect('/admin/settings')
  }
}
