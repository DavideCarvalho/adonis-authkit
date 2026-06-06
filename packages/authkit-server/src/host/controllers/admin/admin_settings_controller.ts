import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { RuntimeSettings } from '../../runtime_settings.js'
import { translate } from '../../i18n.js'
import {
  resolveEffectiveRegistration,
  resolveEffectiveRequireVerifiedEmail,
  resolveEffectiveMaintenanceMode,
  resolveEffectiveAuthMethods,
  resolveEffectiveEmailChange,
  resolveEffectiveSecurityNotifications,
  resolveEffectivePasswordHistory,
  resolveEffectivePasswordExpiration,
  resolveEffectiveSessionPolicy,
  ALL_SECURITY_NOTIFICATION_KINDS,
  type AuthMethodsSetting,
  type EmailChangeSetting,
  type SecurityNotificationsSetting,
  type PasswordHistorySetting,
  type PasswordExpirationSetting,
  type SessionPolicySetting,
} from '../../runtime_toggles.js'
import { getAdminPrefix } from '../../admin_prefix.js'
import {
  supportsMagicLink,
  supportsPasswordHistory,
  supportsPasswordExpiration,
} from '../../../accounts/account_store.js'
import { updateSessionTtlHolder } from '../../../provider/build_provider.js'

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
 * POST /admin/settings/auth-methods                  → salva auth_methods.
 * POST /admin/settings/auth-methods/reset            → apaga auth_methods.
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

    // ---- auth_methods ----
    let currentAuthMethodsSetting: AuthMethodsSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('auth_methods')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentAuthMethodsSetting = raw as AuthMethodsSetting
      }
    }
    // Capabilities: magic link needs mail + store support; passkey needs webauthn config.
    const magicLinkCapable = cfg.passwordless?.magicLink && supportsMagicLink(cfg.accountStore)
    const passkeyCapable = !!cfg.webauthn
    const configuredSocialProviders: string[] = cfg.social?.providers ?? []
    const authMethodsEffective = runtimeSettings
      ? await resolveEffectiveAuthMethods(runtimeSettings, {
          configuredSocialProviders,
          magicLinkCapable,
          passkeyCapable,
        })
      : { password: true, magicLink: magicLinkCapable, passkey: passkeyCapable, social: configuredSocialProviders, forgotPassword: true }

    // ---- email_change ----
    let currentEmailChangeSetting: EmailChangeSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('email_change')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentEmailChangeSetting = raw as EmailChangeSetting
      }
    }
    const emailChangeEffective = runtimeSettings
      ? await resolveEffectiveEmailChange(runtimeSettings)
      : { enabled: true, ttlHours: 24, requirePassword: true }

    // ---- security_notifications ----
    let currentSecurityNotificationsSetting: SecurityNotificationsSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('security_notifications')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentSecurityNotificationsSetting = raw as SecurityNotificationsSetting
      }
    }
    const securityNotificationsEffective = runtimeSettings
      ? await resolveEffectiveSecurityNotifications(runtimeSettings)
      : { enabled: true, kinds: [...ALL_SECURITY_NOTIFICATION_KINDS] }

    // ---- password_history ----
    let currentPasswordHistorySetting: PasswordHistorySetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('password_history')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentPasswordHistorySetting = raw as PasswordHistorySetting
      }
    }
    const passwordHistoryEffective = runtimeSettings
      ? await resolveEffectivePasswordHistory(runtimeSettings)
      : { enabled: false, count: 5 }
    const passwordHistoryCapable = supportsPasswordHistory(cfg.accountStore)

    // ---- password_expiration ----
    let currentPasswordExpirationSetting: PasswordExpirationSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('password_expiration')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentPasswordExpirationSetting = raw as PasswordExpirationSetting
      }
    }
    const passwordExpirationEffective = runtimeSettings
      ? await resolveEffectivePasswordExpiration(runtimeSettings)
      : { enabled: false, maxAgeDays: 90 }
    const passwordExpirationCapable = supportsPasswordExpiration(cfg.accountStore)

    // ---- session_policy ----
    let currentSessionPolicySetting: SessionPolicySetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('session_policy')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentSessionPolicySetting = raw as SessionPolicySetting
      }
    }
    const configSessionHours = cfg.ttl?.session ? Math.ceil(cfg.ttl.session / 3600) : undefined
    const sessionPolicyEffective = runtimeSettings
      ? await resolveEffectiveSessionPolicy(runtimeSettings, configSessionHours)
      : { rememberEnabled: true, rememberDays: 30, defaultSessionHours: configSessionHours ?? 168, singleSession: false, idleTimeoutMinutes: 0 }

    return render(ctx, 'admin/settings', {
      csrfToken: ctx.request.csrfToken,
      adminBase: getAdminPrefix(),
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
      // auth_methods
      currentAuthMethodsSetting,
      authMethodsEffective,
      magicLinkCapable,
      passkeyCapable,
      configuredSocialProviders,
      // email_change
      currentEmailChangeSetting,
      emailChangeEffective,
      // security_notifications
      currentSecurityNotificationsSetting,
      securityNotificationsEffective,
      allSecurityNotificationKinds: ALL_SECURITY_NOTIFICATION_KINDS,
      // password_history
      currentPasswordHistorySetting,
      passwordHistoryEffective,
      passwordHistoryCapable,
      // password_expiration
      currentPasswordExpirationSetting,
      passwordExpirationEffective,
      passwordExpirationCapable,
      // session_policy
      currentSessionPolicySetting,
      sessionPolicyEffective,
      configSessionHours,
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
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
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
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Auth methods
  // -------------------------------------------------------------------------

  async updateAuthMethods(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const password = ctx.request.input('password') === '1' || ctx.request.input('password') === 'true'
    const magicLink = ctx.request.input('magic_link') === '1' || ctx.request.input('magic_link') === 'true'
    const passkey = ctx.request.input('passkey') === '1' || ctx.request.input('passkey') === 'true'
    const forgotPassword = ctx.request.input('forgot_password') === '1' || ctx.request.input('forgot_password') === 'true'

    // Social providers: multi-value checkbox (array or single string).
    const rawSocial = ctx.request.input('social')
    const social: string[] = Array.isArray(rawSocial)
      ? rawSocial
      : typeof rawSocial === 'string' && rawSocial
        ? [rawSocial]
        : []

    const setting: AuthMethodsSetting = {
      password,
      magicLink,
      passkey,
      social,
      forgotPassword,
    }

    await runtimeSettings.setSetting('auth_methods', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'auth_methods', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetAuthMethods(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('auth_methods')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'auth_methods', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Email change
  // -------------------------------------------------------------------------

  async updateEmailChange(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const enabled = ctx.request.input('enabled') === '1' || ctx.request.input('enabled') === 'true'
    const rawTtl = ctx.request.input('ttl_hours')
    const ttlHours = typeof rawTtl === 'string' && rawTtl.trim() !== '' ? Math.max(1, parseInt(rawTtl, 10) || 24) : 24
    const requirePassword = ctx.request.input('require_password') === '1' || ctx.request.input('require_password') === 'true'

    const setting: EmailChangeSetting = { enabled, ttlHours, requirePassword }
    await runtimeSettings.setSetting('email_change', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'email_change', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetEmailChange(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('email_change')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'email_change', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Security notifications
  // -------------------------------------------------------------------------

  async updateSecurityNotifications(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const enabled = ctx.request.input('enabled') === '1' || ctx.request.input('enabled') === 'true'
    const rawKinds = ctx.request.input('kinds')
    const kinds: string[] = Array.isArray(rawKinds)
      ? rawKinds
      : typeof rawKinds === 'string' && rawKinds
        ? [rawKinds]
        : [...ALL_SECURITY_NOTIFICATION_KINDS]

    const setting: SecurityNotificationsSetting = { enabled, kinds }
    await runtimeSettings.setSetting('security_notifications', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'security_notifications', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetSecurityNotifications(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('security_notifications')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'security_notifications', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Password history
  // -------------------------------------------------------------------------

  async updatePasswordHistory(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const enabled = ctx.request.input('enabled') === '1' || ctx.request.input('enabled') === 'true'
    const rawCount = ctx.request.input('count')
    const count = typeof rawCount === 'string' && rawCount.trim() !== '' ? Math.max(1, parseInt(rawCount, 10) || 5) : 5

    const setting: PasswordHistorySetting = { enabled, count }
    await runtimeSettings.setSetting('password_history', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'password_history', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetPasswordHistory(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('password_history')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'password_history', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Password expiration
  // -------------------------------------------------------------------------

  async updatePasswordExpiration(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const enabled = ctx.request.input('enabled') === '1' || ctx.request.input('enabled') === 'true'
    const rawDays = ctx.request.input('max_age_days')
    const maxAgeDays = typeof rawDays === 'string' && rawDays.trim() !== '' ? Math.max(1, parseInt(rawDays, 10) || 90) : 90

    const setting: PasswordExpirationSetting = { enabled, maxAgeDays }
    await runtimeSettings.setSetting('password_expiration', setting, accountId)
    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'password_expiration', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetPasswordExpiration(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('password_expiration')
      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'password_expiration', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Session policy
  // -------------------------------------------------------------------------

  async updateSessionPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const rememberEnabled = ctx.request.input('remember_enabled') === '1' || ctx.request.input('remember_enabled') === 'true'
    const rawRememberDays = ctx.request.input('remember_days')
    const rememberDays = typeof rawRememberDays === 'string' && rawRememberDays.trim() !== '' ? Math.max(1, parseInt(rawRememberDays, 10) || 30) : 30
    const rawDefaultHours = ctx.request.input('default_session_hours')
    const defaultSessionHours = typeof rawDefaultHours === 'string' && rawDefaultHours.trim() !== '' ? Math.max(1, parseInt(rawDefaultHours, 10) || 168) : 168
    const singleSession = ctx.request.input('single_session') === '1' || ctx.request.input('single_session') === 'true'
    const rawIdleMinutes = ctx.request.input('idle_timeout_minutes')
    const idleTimeoutMinutes = typeof rawIdleMinutes === 'string' && rawIdleMinutes.trim() !== '' ? Math.max(0, parseInt(rawIdleMinutes, 10) || 0) : 0

    const setting: SessionPolicySetting = {
      rememberEnabled,
      rememberDays,
      defaultSessionHours,
      singleSession,
      idleTimeoutMinutes,
    }
    await runtimeSettings.setSetting('session_policy', setting, accountId)

    // Atualiza o holder de TTL do OidcService em runtime (sem redeploy).
    updateSessionTtlHolder(service.sessionTtlHolder, { rememberDays, defaultSessionHours })

    await cfg.audit?.record({
      type: 'settings.updated',
      actorId: accountId,
      ip: ctx.request.ip?.() ?? null,
      metadata: { key: 'session_policy', value: setting },
    })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetSessionPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('session_policy')

      // Reseta o holder de TTL para os valores do config estático.
      const configSessionSec = cfg.ttl?.session ?? 604800
      updateSessionTtlHolder(service.sessionTtlHolder, {
        rememberDays: Math.ceil(configSessionSec / 86400),
        defaultSessionHours: Math.ceil(configSessionSec / 3600),
      })

      await cfg.audit?.record({
        type: 'settings.updated',
        actorId: accountId,
        ip: ctx.request.ip?.() ?? null,
        metadata: { key: 'session_policy', action: 'reset_to_config' },
      })
    }

    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }
}
