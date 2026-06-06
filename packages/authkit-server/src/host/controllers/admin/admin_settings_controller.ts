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
  resolveEffectiveLockout,
  resolveEffectiveRateLimit,
  resolveEffectivePasswordPolicy,
  resolveEffectiveNotifications,
  resolveEffectiveTrustedDevices,
  resolveEffectiveTokenTtl,
  resolveEffectiveAdminImpersonation,
  resolveEffectiveOrganizationsPolicy,
  resolveEffectiveAccountExpiration,
  ALL_SECURITY_NOTIFICATION_KINDS,
  type AuthMethodsSetting,
  type EmailChangeSetting,
  type SecurityNotificationsSetting,
  type PasswordHistorySetting,
  type PasswordExpirationSetting,
  type SessionPolicySetting,
  type LockoutSetting,
  type RateLimitSetting,
  type PasswordPolicySetting,
  type NotificationsSetting,
  type TrustedDevicesSetting,
  type TokenTtlSetting,
  type AdminImpersonationSetting,
  type OrganizationsPolicySetting,
  type AccountExpirationSetting,
} from '../../runtime_toggles.js'
import { getAdminPrefix } from '../../admin_prefix.js'
import {
  supportsMagicLink,
  supportsPasswordHistory,
  supportsPasswordExpiration,
} from '../../../accounts/account_store.js'
import { updateSessionTtlHolder, updateTokenTtlHolder } from '../../../provider/build_provider.js'

/** Best-effort: returns RuntimeSettings from container DB, or null if unavailable. */
async function getRuntimeSettings(ctx: HttpContext): Promise<RuntimeSettings | null> {
  try {
    const db = await ctx.containerResolver.make('lucid.db')
    // Passa a conexão do accountStore para que o probe seja searchPath-aware.
    const service = await ctx.containerResolver.make('authkit.server').catch(() => null)
    const connection: string | undefined = (service?.config?.accountStore as any)?.connectionName
    return new RuntimeSettings(db, connection ? { connection } : {})
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
      : { password: true, magicLink: magicLinkCapable, passkey: passkeyCapable, social: configuredSocialProviders, forgotPassword: true, passkeyAutofill: passkeyCapable }

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

    // ---- lockout ----
    let currentLockoutSetting: LockoutSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('lockout')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentLockoutSetting = raw as LockoutSetting
      }
    }
    const lockoutConfigDefaults = {
      enabled: cfg.lockout?.enabled,
      maxAttempts: cfg.lockout?.maxAttempts,
      windowSec: cfg.lockout?.windowSec,
      baseLockoutSec: cfg.lockout?.baseLockoutSec,
      maxLockoutSec: cfg.lockout?.maxLockoutSec,
    }
    const lockoutEffective = runtimeSettings
      ? await resolveEffectiveLockout(runtimeSettings, lockoutConfigDefaults)
      : { enabled: lockoutConfigDefaults.enabled ?? true, maxAttempts: lockoutConfigDefaults.maxAttempts ?? 5, windowSec: lockoutConfigDefaults.windowSec ?? 900, baseLockoutSec: lockoutConfigDefaults.baseLockoutSec ?? 60, maxLockoutSec: lockoutConfigDefaults.maxLockoutSec ?? 3600 }

    // ---- rate_limit ----
    let currentRateLimitSetting: RateLimitSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('rate_limit')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentRateLimitSetting = raw as RateLimitSetting
      }
    }
    const rateLimitConfigDefaults = {
      login: cfg.rateLimit?.login,
      introspection: cfg.rateLimit?.introspection,
    }
    const rateLimitEffective = runtimeSettings
      ? await resolveEffectiveRateLimit(runtimeSettings, rateLimitConfigDefaults)
      : { login: { points: rateLimitConfigDefaults.login?.points ?? 10, duration: rateLimitConfigDefaults.login?.duration ?? '1 min' }, introspection: { points: rateLimitConfigDefaults.introspection?.points ?? 60, duration: rateLimitConfigDefaults.introspection?.duration ?? '1 min' } }

    // ---- password_policy ----
    let currentPasswordPolicySetting: PasswordPolicySetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('password_policy')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentPasswordPolicySetting = raw as PasswordPolicySetting
      }
    }
    const store = cfg.accountStore
    const pwConfig = store?.__passwordConfig as { policy?: Record<string, any>; checkPwned?: any } | undefined
    const passwordPolicyConfigDefaults = {
      minLength: pwConfig?.policy?.minLength,
      requireUppercase: pwConfig?.policy?.requireUppercase,
      requireLowercase: pwConfig?.policy?.requireLowercase,
      requireNumbers: pwConfig?.policy?.requireNumbers,
      requireSymbols: pwConfig?.policy?.requireSymbols,
      checkPwned: pwConfig?.checkPwned ? true : false,
      blockCommon: true,
    }
    const passwordPolicyEffective = runtimeSettings
      ? await resolveEffectivePasswordPolicy(runtimeSettings, passwordPolicyConfigDefaults)
      : { minLength: passwordPolicyConfigDefaults.minLength ?? 8, requireUppercase: passwordPolicyConfigDefaults.requireUppercase ?? false, requireLowercase: passwordPolicyConfigDefaults.requireLowercase ?? false, requireNumbers: passwordPolicyConfigDefaults.requireNumbers ?? false, requireSymbols: passwordPolicyConfigDefaults.requireSymbols ?? false, checkPwned: passwordPolicyConfigDefaults.checkPwned ?? false, blockCommon: passwordPolicyConfigDefaults.blockCommon ?? true }

    // ---- notifications ----
    let currentNotificationsSetting: NotificationsSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('notifications')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentNotificationsSetting = raw as NotificationsSetting
      }
    }
    const notificationsConfigDefaults = {
      newLoginEmail: cfg.notifications?.newLoginEmail,
      newDeviceEmail: cfg.notifications?.newDeviceEmail,
    }
    const notificationsEffective = runtimeSettings
      ? await resolveEffectiveNotifications(runtimeSettings, notificationsConfigDefaults)
      : { newLoginEmail: notificationsConfigDefaults.newLoginEmail ?? true, newDeviceEmail: notificationsConfigDefaults.newDeviceEmail ?? true }

    // ---- trusted_devices ----
    let currentTrustedDevicesSetting: TrustedDevicesSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('trusted_devices')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentTrustedDevicesSetting = raw as TrustedDevicesSetting
      }
    }
    const trustedDevicesConfigDefaults = {
      enabled: cfg.trustedDevices?.enabled,
      days: cfg.trustedDevices?.days,
    }
    const trustedDevicesEffective = runtimeSettings
      ? await resolveEffectiveTrustedDevices(runtimeSettings, trustedDevicesConfigDefaults)
      : { enabled: trustedDevicesConfigDefaults.enabled ?? true, days: trustedDevicesConfigDefaults.days ?? 30 }

    // ---- token_ttl ----
    let currentTokenTtlSetting: TokenTtlSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('token_ttl')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentTokenTtlSetting = raw as TokenTtlSetting
      }
    }
    const tokenTtlConfigDefaults = {
      accessTokenSec: cfg.ttl?.accessToken,
      idTokenSec: cfg.ttl?.idToken,
      refreshTokenSec: cfg.ttl?.refreshToken,
    }
    const tokenTtlEffective = runtimeSettings
      ? await resolveEffectiveTokenTtl(runtimeSettings, tokenTtlConfigDefaults)
      : { accessTokenSec: tokenTtlConfigDefaults.accessTokenSec ?? 900, idTokenSec: tokenTtlConfigDefaults.idTokenSec ?? 900, refreshTokenSec: tokenTtlConfigDefaults.refreshTokenSec ?? 2592000 }

    // ---- admin_impersonation ----
    let currentAdminImpersonationSetting: AdminImpersonationSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('admin_impersonation')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentAdminImpersonationSetting = raw as AdminImpersonationSetting
      }
    }
    const adminImpersonationConfigDefault = cfg.admin?.impersonation ?? false
    const adminImpersonationEffective = runtimeSettings
      ? await resolveEffectiveAdminImpersonation(runtimeSettings, adminImpersonationConfigDefault)
      : { enabled: adminImpersonationConfigDefault }

    // ---- organizations_policy ----
    let currentOrganizationsPolicySetting: OrganizationsPolicySetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('organizations_policy')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentOrganizationsPolicySetting = raw as OrganizationsPolicySetting
      }
    }
    const orgsPolicyConfigDefaults = {
      allowSelfCreate: cfg.organizations?.allowSelfCreate,
      invitationTtlHours: cfg.organizations?.invitationTtlHours,
      roles: cfg.organizations?.roles,
    }
    const organizationsPolicyEffective = runtimeSettings
      ? await resolveEffectiveOrganizationsPolicy(runtimeSettings, orgsPolicyConfigDefaults)
      : { allowSelfCreate: orgsPolicyConfigDefaults.allowSelfCreate ?? false, invitationTtlHours: orgsPolicyConfigDefaults.invitationTtlHours ?? 168, roles: orgsPolicyConfigDefaults.roles ?? ['owner', 'admin', 'member'] }

    // ---- otp_lockout ----
    let currentOtpLockoutSetting: { enabled?: boolean; maxAttempts?: number; unlockTtlHours?: number } | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('otp_lockout')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentOtpLockoutSetting = raw as { enabled?: boolean; maxAttempts?: number; unlockTtlHours?: number }
      }
    }
    const { resolveEffectiveOtpLockout: _resolveOtpLockout } = await import('../../otp_lockout.js')
    const otpLockoutEffective = runtimeSettings
      ? await _resolveOtpLockout(runtimeSettings)
      : { enabled: true, maxAttempts: 5, unlockTtlHours: 24 }

    // ---- sudo_mode ----
    let currentSudoModeSetting: { enabled?: boolean; graceMinutes?: number } | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('sudo_mode')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentSudoModeSetting = raw as { enabled?: boolean; graceMinutes?: number }
      }
    }
    const { resolveEffectiveSudoMode: _resolveSudoMode } = await import('../../sudo_mode.js')
    const sudoModeEffective = runtimeSettings
      ? await _resolveSudoMode(runtimeSettings)
      : { enabled: true, graceMinutes: 15 }

    // ---- account_expiration ----
    let currentAccountExpirationSetting: AccountExpirationSetting | null = null
    if (runtimeSettings && hasTable) {
      const raw = await runtimeSettings.getSetting('account_expiration')
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        currentAccountExpirationSetting = raw as AccountExpirationSetting
      }
    }
    const accountExpirationEffective = runtimeSettings
      ? await resolveEffectiveAccountExpiration(runtimeSettings)
      : { enabled: false, inactiveDays: 365, warnDays: 14 }
    // Audit queryable = audit sink implements list (capability-probed).
    const auditQuerySupported = typeof cfg.audit?.list === 'function'

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
      // lockout
      currentLockoutSetting,
      lockoutEffective,
      // rate_limit
      currentRateLimitSetting,
      rateLimitEffective,
      // password_policy
      currentPasswordPolicySetting,
      passwordPolicyEffective,
      // notifications
      currentNotificationsSetting,
      notificationsEffective,
      // trusted_devices
      currentTrustedDevicesSetting,
      trustedDevicesEffective,
      // token_ttl
      currentTokenTtlSetting,
      tokenTtlEffective,
      // admin_impersonation
      currentAdminImpersonationSetting,
      adminImpersonationEffective,
      // organizations_policy
      currentOrganizationsPolicySetting,
      organizationsPolicyEffective,
      // otp_lockout
      currentOtpLockoutSetting,
      otpLockoutEffective,
      // sudo_mode
      currentSudoModeSetting,
      sudoModeEffective,
      // account_expiration
      currentAccountExpirationSetting,
      accountExpirationEffective,
      auditQuerySupported,
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
    const passkeyAutofill = ctx.request.input('passkey_autofill') === '1' || ctx.request.input('passkey_autofill') === 'true'

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
      passkeyAutofill,
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

  // -------------------------------------------------------------------------
  // Lockout
  // -------------------------------------------------------------------------

  async updateLockout(ctx: HttpContext) {
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
    const rawMaxAttempts = ctx.request.input('max_attempts')
    const maxAttempts = typeof rawMaxAttempts === 'string' && rawMaxAttempts.trim() !== '' ? Math.max(1, parseInt(rawMaxAttempts, 10) || 5) : 5
    const rawWindowSec = ctx.request.input('window_sec')
    const windowSec = typeof rawWindowSec === 'string' && rawWindowSec.trim() !== '' ? Math.max(1, parseInt(rawWindowSec, 10) || 900) : 900
    const rawBaseLockout = ctx.request.input('base_lockout_sec')
    const baseLockoutSec = typeof rawBaseLockout === 'string' && rawBaseLockout.trim() !== '' ? Math.max(1, parseInt(rawBaseLockout, 10) || 60) : 60
    const rawMaxLockout = ctx.request.input('max_lockout_sec')
    const maxLockoutSec = typeof rawMaxLockout === 'string' && rawMaxLockout.trim() !== '' ? Math.max(1, parseInt(rawMaxLockout, 10) || 3600) : 3600

    const setting = { enabled, maxAttempts, windowSec, baseLockoutSec, maxLockoutSec }
    await runtimeSettings.setSetting('lockout', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'lockout', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetLockout(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('lockout')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'lockout', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Rate limit
  // -------------------------------------------------------------------------

  async updateRateLimit(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const rawLoginPoints = ctx.request.input('login_points')
    const loginPoints = typeof rawLoginPoints === 'string' && rawLoginPoints.trim() !== '' ? Math.max(1, parseInt(rawLoginPoints, 10) || 10) : 10
    const loginDuration = ctx.request.input('login_duration') || '1 min'
    const rawIntrPoints = ctx.request.input('introspection_points')
    const introspectionPoints = typeof rawIntrPoints === 'string' && rawIntrPoints.trim() !== '' ? Math.max(1, parseInt(rawIntrPoints, 10) || 60) : 60
    const introspectionDuration = ctx.request.input('introspection_duration') || '1 min'

    const setting = { login: { points: loginPoints, duration: loginDuration }, introspection: { points: introspectionPoints, duration: introspectionDuration } }
    await runtimeSettings.setSetting('rate_limit', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'rate_limit', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetRateLimit(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('rate_limit')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'rate_limit', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Password policy
  // -------------------------------------------------------------------------

  async updatePasswordPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const rawMinLength = ctx.request.input('min_length')
    const minLength = typeof rawMinLength === 'string' && rawMinLength.trim() !== '' ? Math.max(1, parseInt(rawMinLength, 10) || 8) : 8
    const requireUppercase = ctx.request.input('require_uppercase') === '1' || ctx.request.input('require_uppercase') === 'true'
    const requireLowercase = ctx.request.input('require_lowercase') === '1' || ctx.request.input('require_lowercase') === 'true'
    const requireNumbers = ctx.request.input('require_numbers') === '1' || ctx.request.input('require_numbers') === 'true'
    const requireSymbols = ctx.request.input('require_symbols') === '1' || ctx.request.input('require_symbols') === 'true'
    const checkPwned = ctx.request.input('check_pwned') === '1' || ctx.request.input('check_pwned') === 'true'
    const blockCommon = ctx.request.input('block_common') !== '0' && ctx.request.input('block_common') !== 'false'

    const setting: PasswordPolicySetting = { minLength, requireUppercase, requireLowercase, requireNumbers, requireSymbols, checkPwned, blockCommon }
    await runtimeSettings.setSetting('password_policy', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'password_policy', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetPasswordPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('password_policy')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'password_policy', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Notifications (new login / new device emails)
  // -------------------------------------------------------------------------

  async updateNotifications(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const newLoginEmail = ctx.request.input('new_login_email') === '1' || ctx.request.input('new_login_email') === 'true'
    const newDeviceEmail = ctx.request.input('new_device_email') === '1' || ctx.request.input('new_device_email') === 'true'

    const setting: NotificationsSetting = { newLoginEmail, newDeviceEmail }
    await runtimeSettings.setSetting('notifications', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'notifications', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetNotifications(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('notifications')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'notifications', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Trusted devices
  // -------------------------------------------------------------------------

  async updateTrustedDevices(ctx: HttpContext) {
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
    const rawDays = ctx.request.input('days')
    const days = typeof rawDays === 'string' && rawDays.trim() !== '' ? Math.max(1, parseInt(rawDays, 10) || 30) : 30

    const setting: TrustedDevicesSetting = { enabled, days }
    await runtimeSettings.setSetting('trusted_devices', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'trusted_devices', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetTrustedDevices(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('trusted_devices')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'trusted_devices', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Token TTL
  // -------------------------------------------------------------------------

  async updateTokenTtl(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const rawAccessToken = ctx.request.input('access_token_sec')
    const accessTokenSec = typeof rawAccessToken === 'string' && rawAccessToken.trim() !== '' ? Math.max(1, parseInt(rawAccessToken, 10) || 900) : 900
    const rawIdToken = ctx.request.input('id_token_sec')
    const idTokenSec = typeof rawIdToken === 'string' && rawIdToken.trim() !== '' ? Math.max(1, parseInt(rawIdToken, 10) || 900) : 900
    const rawRefreshToken = ctx.request.input('refresh_token_sec')
    const refreshTokenSec = typeof rawRefreshToken === 'string' && rawRefreshToken.trim() !== '' ? Math.max(1, parseInt(rawRefreshToken, 10) || 2592000) : 2592000

    const setting: TokenTtlSetting = { accessTokenSec, idTokenSec, refreshTokenSec }
    await runtimeSettings.setSetting('token_ttl', setting, accountId)

    // Atualiza o holder de TTL dos tokens em runtime (sem redeploy).
    updateTokenTtlHolder(service.tokenTtlHolder, { accessTokenSec, idTokenSec, refreshTokenSec })

    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'token_ttl', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetTokenTtl(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('token_ttl')

      // Reseta o holder para os valores do config estático.
      updateTokenTtlHolder(service.tokenTtlHolder, {
        accessTokenSec: cfg.ttl?.accessToken ?? 900,
        idTokenSec: cfg.ttl?.idToken ?? 900,
        refreshTokenSec: cfg.ttl?.refreshToken ?? 2592000,
      })

      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'token_ttl', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Admin impersonation
  // -------------------------------------------------------------------------

  async updateAdminImpersonation(ctx: HttpContext) {
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
    const setting: AdminImpersonationSetting = { enabled }
    await runtimeSettings.setSetting('admin_impersonation', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'admin_impersonation', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetAdminImpersonation(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('admin_impersonation')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'admin_impersonation', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Organizations policy
  // -------------------------------------------------------------------------

  async updateOrganizationsPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null

    const runtimeSettings = await getRuntimeSettings(ctx)
    if (!runtimeSettings || !(await runtimeSettings.isTablePresent())) {
      ctx.session?.flash('flash', t('admin.settings.no_settings_table'))
      return ctx.response.redirect(`${getAdminPrefix()}/settings`)
    }

    const allowSelfCreate = ctx.request.input('allow_self_create') === '1' || ctx.request.input('allow_self_create') === 'true'
    const rawTtl = ctx.request.input('invitation_ttl_hours')
    const invitationTtlHours = typeof rawTtl === 'string' && rawTtl.trim() !== '' ? Math.max(1, parseInt(rawTtl, 10) || 168) : 168
    const rawRoles = ctx.request.input('roles')
    const roles: string[] = typeof rawRoles === 'string' && rawRoles.trim()
      ? rawRoles.split(',').map((r) => r.trim()).filter(Boolean)
      : ['owner', 'admin', 'member']

    const setting: OrganizationsPolicySetting = { allowSelfCreate, invitationTtlHours, roles }
    await runtimeSettings.setSetting('organizations_policy', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'organizations_policy', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetOrganizationsPolicy(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('organizations_policy')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'organizations_policy', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // OTP lockout
  // -------------------------------------------------------------------------

  async updateOtpLockout(ctx: HttpContext) {
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
    const rawMax = ctx.request.input('max_attempts')
    const maxAttempts = typeof rawMax === 'string' && rawMax.trim() !== '' ? Math.max(1, parseInt(rawMax, 10) || 5) : 5
    const rawTtl = ctx.request.input('unlock_ttl_hours')
    const unlockTtlHours = typeof rawTtl === 'string' && rawTtl.trim() !== '' ? Math.max(1, parseInt(rawTtl, 10) || 24) : 24

    const setting = { enabled, maxAttempts, unlockTtlHours }
    await runtimeSettings.setSetting('otp_lockout', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'otp_lockout', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetOtpLockout(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('otp_lockout')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'otp_lockout', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Sudo mode
  // -------------------------------------------------------------------------

  async updateSudoMode(ctx: HttpContext) {
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
    const rawGrace = ctx.request.input('grace_minutes')
    const graceMinutes = typeof rawGrace === 'string' && rawGrace.trim() !== '' ? Math.max(0, parseInt(rawGrace, 10) || 15) : 15

    const setting = { enabled, graceMinutes }
    await runtimeSettings.setSetting('sudo_mode', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'sudo_mode', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetSudoMode(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('sudo_mode')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'sudo_mode', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  // -------------------------------------------------------------------------
  // Account expiration
  // -------------------------------------------------------------------------

  async updateAccountExpiration(ctx: HttpContext) {
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
    const rawInactive = ctx.request.input('inactive_days')
    const inactiveDays = typeof rawInactive === 'string' && rawInactive.trim() !== '' ? Math.max(1, parseInt(rawInactive, 10) || 365) : 365
    const rawWarn = ctx.request.input('warn_days')
    const warnDays = typeof rawWarn === 'string' && rawWarn.trim() !== '' ? Math.max(0, parseInt(rawWarn, 10) || 14) : 14

    const setting: AccountExpirationSetting = { enabled, inactiveDays, warnDays }
    await runtimeSettings.setSetting('account_expiration', setting, accountId)
    await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'account_expiration', value: setting } })

    ctx.session?.flash('flash', t('admin.settings.saved'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }

  async resetAccountExpiration(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const t = (key: string) => translate(cfg.messages, key)
    const accountId = ctx.session?.get('authkit_account_id') as string | undefined ?? null
    const runtimeSettings = await getRuntimeSettings(ctx)
    if (runtimeSettings) {
      await runtimeSettings.deleteSetting('account_expiration')
      await cfg.audit?.record({ type: 'settings.updated', actorId: accountId, ip: ctx.request.ip?.() ?? null, metadata: { key: 'account_expiration', action: 'reset_to_config' } })
    }
    ctx.session?.flash('flash', t('admin.settings.reset_done'))
    return ctx.response.redirect(`${getAdminPrefix()}/settings`)
  }
}
