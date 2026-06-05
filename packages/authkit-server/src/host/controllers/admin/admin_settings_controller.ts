import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeSettings } from '../../runtime_settings.js'
import { translate } from '../../i18n.js'
import {
  resolveEffectiveRegistration,
  resolveEffectiveRequireVerifiedEmail,
  resolveEffectiveMaintenanceMode,
} from '../../runtime_toggles.js'

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
 * GET  /admin/settings
 * POST /admin/settings/bot-protection               → salva bot_protection.
 * POST /admin/settings/bot-protection/reset          → apaga bot_protection.
 * POST /admin/settings/registration                  → salva registration.
 * POST /admin/settings/registration/reset            → apaga registration.
 * POST /admin/settings/require-verified-email        → salva require_verified_email.
 * POST /admin/settings/require-verified-email/reset  → apaga require_verified_email.
 * POST /admin/settings/maintenance                   → salva maintenance_mode + audita.
 * POST /admin/settings/maintenance/reset             → apaga maintenance_mode + audita.
 */
export default class AdminSettingsController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const runtimeSettings = await getRuntimeSettings(ctx)
    const hasTable = runtimeSettings ? await runtimeSettings.isTablePresent() : false

    // ---- bot protection ----
    const hasBotConfig = !!cfg.botProtection
    let currentBotSetting: { enabled: boolean; on?: string[] } | null = null

    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('bot_protection')
      if (raw && typeof raw === 'object' && typeof (raw as any).enabled === 'boolean') {
        currentBotSetting = raw as { enabled: boolean; on?: string[] }
      }
    }

    const configOn = cfg.botProtection?.on ?? ['login', 'signup']
    const botFormEnabled = currentBotSetting !== null ? currentBotSetting.enabled : true
    const botFormOn = currentBotSetting?.on ?? configOn

    // ---- registration ----
    let currentRegistrationSetting: { enabled: boolean } | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('registration')
      if (raw && typeof raw === 'object' && typeof (raw as any).enabled === 'boolean') {
        currentRegistrationSetting = raw as { enabled: boolean }
      }
    }
    const registrationConfigDefault = cfg.registration?.enabled ?? true
    const registrationEffective = runtimeSettings
      ? await resolveEffectiveRegistration(registrationConfigDefault, runtimeSettings)
      : registrationConfigDefault

    // ---- require_verified_email ----
    let currentRequireVerifiedSetting: { enabled: boolean } | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('require_verified_email')
      if (raw && typeof raw === 'object' && typeof (raw as any).enabled === 'boolean') {
        currentRequireVerifiedSetting = raw as { enabled: boolean }
      }
    }
    const requireVerifiedConfigDefault = cfg.login?.requireVerifiedEmail ?? false
    const requireVerifiedEffective = runtimeSettings
      ? await resolveEffectiveRequireVerifiedEmail(requireVerifiedConfigDefault, runtimeSettings)
      : requireVerifiedConfigDefault

    // ---- maintenance_mode ----
    let currentMaintenanceSetting: { enabled: boolean; message?: string } | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('maintenance_mode')
      if (raw && typeof raw === 'object' && typeof (raw as any).enabled === 'boolean') {
        currentMaintenanceSetting = raw as { enabled: boolean; message?: string }
      }
    }
    const maintenanceEffective = runtimeSettings
      ? await resolveEffectiveMaintenanceMode(runtimeSettings)
      : { enabled: false }

    return render(ctx, 'admin/settings', {
      csrfToken: ctx.request.csrfToken,
      flash: ctx.session?.flashMessages?.get?.('flash') ?? null,
      // bot protection
      hasBotConfig,
      hasTable,
      formEnabled: botFormEnabled,
      formOn: botFormOn,
      configOn,
      currentSetting: currentBotSetting,
      // registration
      currentRegistrationSetting,
      registrationConfigDefault,
      registrationEffective,
      // require_verified_email
      currentRequireVerifiedSetting,
      requireVerifiedConfigDefault,
      requireVerifiedEffective,
      // maintenance_mode
      currentMaintenanceSetting,
      maintenanceEffective,
    })
  }

  // -------------------------------------------------------------------------
  // Bot protection
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async updateRegistration(ctx: HttpContext) {
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
    const setting = { enabled }

    await runtimeSettings.setSetting('registration', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'registration', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect('/admin/settings')
  }

  async resetRegistration(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('registration')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'registration', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect('/admin/settings')
  }

  // -------------------------------------------------------------------------
  // Require verified email
  // -------------------------------------------------------------------------

  async updateRequireVerifiedEmail(ctx: HttpContext) {
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
    const setting = { enabled }

    await runtimeSettings.setSetting('require_verified_email', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'require_verified_email', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect('/admin/settings')
  }

  async resetRequireVerifiedEmail(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('require_verified_email')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'require_verified_email', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect('/admin/settings')
  }

  // -------------------------------------------------------------------------
  // Maintenance mode
  // Audits maintenance.enabled / maintenance.disabled at the POINT OF CHANGE.
  // -------------------------------------------------------------------------

  async updateMaintenance(ctx: HttpContext) {
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
    const rawMessage = ctx.request.input('message')
    const message = typeof rawMessage === 'string' && rawMessage.trim() ? rawMessage.trim() : undefined

    const setting: { enabled: boolean; message?: string } = { enabled }
    if (message) setting.message = message

    await runtimeSettings.setSetting('maintenance_mode', setting, accountId)

    // Audit the state change with a dedicated event type for easy filtering.
    await cfg.audit?.record({
      type: enabled ? 'maintenance.enabled' : 'maintenance.disabled',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'maintenance_mode', value: setting },
    })
    // Also emit the generic settings.updated event.
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'maintenance_mode', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect('/admin/settings')
  }

  async resetMaintenance(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('maintenance_mode')
      // Audit the disable event (reset = effectively disabled).
      await cfg.audit?.record({
        type: 'maintenance.disabled',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'maintenance_mode', action: 'reset_to_config' },
      })
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'maintenance_mode', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect('/admin/settings')
  }
}
