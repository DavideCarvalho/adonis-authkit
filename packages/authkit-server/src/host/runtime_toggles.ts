/**
 * Runtime toggles — settings de `auth_settings` que controlam comportamento
 * operacional em tempo de execução, no padrão do bot_protection resolver.
 *
 * Cada setting segue o contrato:
 *   - setting presente → manda (sobrescreve config estático)
 *   - setting ausente/inválido/erro DB → config estático (fail-safe total)
 *
 * Keys conhecidas em `auth_settings`:
 *   - `registration`         → RegistrationSetting
 *   - `require_verified_email` → RequireVerifiedEmailSetting
 *   - `maintenance_mode`     → MaintenanceModeSetting
 */

import type { SettingsCapability } from './runtime_settings.js'

// ---------------------------------------------------------------------------
// Known setting keys registry
// ---------------------------------------------------------------------------

/**
 * Chaves conhecidas do catálogo de runtime settings. Centralizado aqui para
 * que qualquer code-path possa importar a constante e não depender de strings.
 */
export const SETTING_KEYS = {
  BOT_PROTECTION: 'bot_protection',
  REGISTRATION: 'registration',
  REQUIRE_VERIFIED_EMAIL: 'require_verified_email',
  MAINTENANCE_MODE: 'maintenance_mode',
  AUTH_METHODS: 'auth_methods',
  EMAIL_CHANGE: 'email_change',
  SECURITY_NOTIFICATIONS: 'security_notifications',
  PASSWORD_HISTORY: 'password_history',
  PASSWORD_EXPIRATION: 'password_expiration',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

// ---------------------------------------------------------------------------
// 1. registration setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `registration` em `auth_settings`.
 *
 * Quando `enabled: false`, o signup público é recusado (GET mostra mensagem;
 * POST rejeita). Fluxos administrativos (admin create + org invite) continuam
 * funcionando — eles NÃO passam por este guard.
 */
export interface RegistrationSetting {
  enabled: boolean
}

/**
 * Resolve o valor efetivo de "registration enabled" combinando a setting
 * persistida em runtime com o config estático.
 *
 * Regras:
 *   - `config.registration?.enabled` pode estar em `ResolvedServerConfig`
 *     (quando o host o declara). Default: `true` (aberto por padrão).
 *   - setting presente → sobrescreve o default/config.
 *   - setting ausente/inválido/erro → usa configDefault.
 *
 * FAIL-SAFE: `getSetting` nunca lança (contrato do RuntimeSettings). Se
 * retornar null, usamos configDefault.
 */
export async function resolveEffectiveRegistration(
  configDefault: boolean = true,
  settings: SettingsCapability
): Promise<boolean> {
  const raw = await settings.getSetting(SETTING_KEYS.REGISTRATION)
  if (raw === null || raw === undefined) return configDefault
  if (typeof raw !== 'object' || typeof (raw as any).enabled !== 'boolean') {
    return configDefault // shape inválida → fallback
  }
  return (raw as RegistrationSetting).enabled
}

// ---------------------------------------------------------------------------
// 2. require_verified_email setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `require_verified_email` em `auth_settings`.
 *
 * Quando presente, sobrescreve `login.requireVerifiedEmail` do config estático
 * para todos os três fluxos de login (senha, magic link, passkey-first).
 *
 * `graceDays` (opcional, default 0): conta NÃO verificada pode logar até
 * `created_at + graceDays` dias. Após a janela, comporta-se como hoje (bloqueia).
 * 0 = sem graça (comportamento original).
 */
export interface RequireVerifiedEmailSetting {
  enabled: boolean
  /** Dias de graça após o cadastro. Default: 0 (sem graça). */
  graceDays?: number
}

/** Resultado resolvido de `require_verified_email`. */
export interface ResolvedRequireVerifiedEmail {
  enabled: boolean
  /** Dias de graça após o cadastro (0 = sem graça). */
  graceDays: number
}

/**
 * Resolve o valor efetivo de `requireVerifiedEmail` combinando a setting
 * persistida em runtime com o config estático.
 *
 * Regras (mesmas do `resolveEffectiveRegistration`):
 *   - configDefault vem de `cfg.login.requireVerifiedEmail` (default false).
 *   - setting presente → sobrescreve.
 *   - setting ausente/inválido/erro → usa configDefault.
 */
export async function resolveEffectiveRequireVerifiedEmail(
  configDefault: boolean = false,
  settings: SettingsCapability
): Promise<boolean> {
  const raw = await settings.getSetting(SETTING_KEYS.REQUIRE_VERIFIED_EMAIL)
  if (raw === null || raw === undefined) return configDefault
  if (typeof raw !== 'object' || typeof (raw as any).enabled !== 'boolean') {
    return configDefault // shape inválida → fallback
  }
  return (raw as RequireVerifiedEmailSetting).enabled
}

/**
 * Resolve o valor efetivo COMPLETO de `require_verified_email` incluindo
 * `graceDays`. Usado pelo gate de login para implementar a janela de graça.
 *
 * FAIL-SAFE: qualquer erro → `{ enabled: configDefault, graceDays: 0 }`.
 */
export async function resolveEffectiveRequireVerifiedEmailFull(
  configDefault: boolean = false,
  settings: SettingsCapability
): Promise<ResolvedRequireVerifiedEmail> {
  try {
    const raw = await settings.getSetting(SETTING_KEYS.REQUIRE_VERIFIED_EMAIL)
    if (raw === null || raw === undefined) return { enabled: configDefault, graceDays: 0 }
    if (typeof raw !== 'object' || typeof (raw as any).enabled !== 'boolean') {
      return { enabled: configDefault, graceDays: 0 }
    }
    const s = raw as RequireVerifiedEmailSetting
    const graceDays = typeof s.graceDays === 'number' && s.graceDays >= 0 ? Math.floor(s.graceDays) : 0
    return { enabled: s.enabled, graceDays }
  } catch {
    return { enabled: configDefault, graceDays: 0 }
  }
}

// ---------------------------------------------------------------------------
// 3. maintenance_mode setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `maintenance_mode` em `auth_settings`.
 *
 * Quando `enabled: true`:
 *   - Telas de login/signup/forgot/interaction mostram página de manutenção.
 *   - POSTs desses fluxos rejeitam (503-like / redirect para manutenção).
 *   - Fluxos de token OIDC já autenticados (refresh, introspection, userinfo)
 *     CONTINUAM funcionando — não derrubamos sessões existentes.
 *   - Admin API e console admin continuam acessíveis.
 *   - Login de contas com role admin (conforme `cfg.admin.roles`) CONTINUA
 *     PERMITIDO — senão o operador se tranca fora. Contas comuns são bloqueadas.
 *
 * `message` é exibida na página de manutenção. Quando ausente, usa i18n default.
 *
 * @remarks LOCKOUT SAFETY
 *   O login admin continua funcionando durante a manutenção (verificado pela
 *   role da conta). Se por qualquer razão o console admin não estiver acessível
 *   via browser (ex.: infra), o operador pode desligar a manutenção via Admin
 *   REST API (PUT /api/authkit/v1/settings/maintenance_mode) sem precisar fazer
 *   login. A Admin API usa API-key authentication, imune ao modo manutenção.
 */
export interface MaintenanceModeSetting {
  enabled: boolean
  /** Mensagem custom exibida na tela de manutenção. Opcional. */
  message?: string
}

/** Resultado resolvido do maintenance mode, pronto para consumo pelos controllers. */
export interface ResolvedMaintenanceMode {
  enabled: boolean
  message?: string
}

/**
 * Resolve o estado efetivo do maintenance mode a partir da setting persistida.
 *
 * Regras:
 *   - setting ausente/inválido/erro DB → `{ enabled: false }` (default: sistema UP).
 *   - setting presente → usa o valor da setting.
 *
 * FAIL-SAFE: qualquer erro → sistema considerado UP (disponibilidade > proteção).
 */
export async function resolveEffectiveMaintenanceMode(
  settings: SettingsCapability
): Promise<ResolvedMaintenanceMode> {
  const raw = await settings.getSetting(SETTING_KEYS.MAINTENANCE_MODE)
  if (raw === null || raw === undefined) return { enabled: false }
  if (typeof raw !== 'object' || typeof (raw as any).enabled !== 'boolean') {
    return { enabled: false } // shape inválida → fail-safe
  }
  const setting = raw as MaintenanceModeSetting
  return {
    enabled: setting.enabled,
    message: typeof setting.message === 'string' ? setting.message : undefined,
  }
}

// ---------------------------------------------------------------------------
// 4. auth_methods setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `auth_methods` em `auth_settings`.
 *
 * Controla quais métodos de login a tela oferece em runtime. Todos os campos
 * são opcionais — campos ausentes são derivados do config/capabilities.
 *
 * @remarks
 *   - `password`:      exibe o formulário de senha. Default: true.
 *   - `magicLink`:     exibe o botão "me envie um link de login". Default: true
 *                      se o mail/store suportam.
 *   - `passkey`:       exibe o botão "entrar com passkey" (passkey-first).
 *                      Default: true se webauthn configurado e conta tem passkeys.
 *   - `social`:        lista dos providers sociais a exibir. Default: todos os
 *                      providers configurados em `config.social.providers`.
 *                      A setting só pode FILTRAR (não ATIVAR) providers; providers
 *                      não presentes no config nunca aparecem.
 *   - `forgotPassword`: exibe o link "esqueci minha senha". Default: true.
 *                      AUTO-DERIVADO: sempre false quando `password` efetivo é false.
 */
export interface AuthMethodsSetting {
  password?: boolean
  magicLink?: boolean
  passkey?: boolean
  social?: string[]
  forgotPassword?: boolean
}

/**
 * Resultado resolvido dos métodos de autenticação, pronto para consumo pelas views.
 */
export interface ResolvedAuthMethods {
  password: boolean
  magicLink: boolean
  passkey: boolean
  social: string[]
  forgotPassword: boolean
}

/**
 * Capabilities de runtime necessárias para derivar os defaults de auth_methods.
 * Campos opcionais — quando ausentes, assume defaults conservadores.
 */
export interface AuthMethodsCapabilities {
  /** Providers sociais configurados no config estático. */
  configuredSocialProviders?: string[]
  /** Magic link disponível (config.passwordless.magicLink && store.issueMagicLinkToken). */
  magicLinkCapable?: boolean
  /** Passkey-first disponível (config.passwordless.passkeyFirst && store tem passkeys). */
  passkeyCapable?: boolean
}

/**
 * Resolve os métodos de autenticação efetivos combinando config estático + setting
 * persistida em runtime + capabilities.
 *
 * Regras:
 *   1. Defaults derivados do config/capabilities.
 *   2. Setting presente → sobrescreve campo a campo.
 *   3. DERIVAÇÃO: `forgotPassword` efetivo = (setting.forgotPassword ?? true) && passwordEnabled.
 *      Sem método senha ativo, "esqueci minha senha" NUNCA aparece.
 *   4. `social` efetivo = interseção do setting.social com os providers do config.
 *      Setting não pode LIGAR provider que o código não tem.
 *   5. FAIL-SAFE all-off: se todos os métodos ficarem desligados, volta ao derivado
 *      do config (nunca deixar a tela sem nenhum método). Loga um aviso (console.warn).
 *   6. Qualquer erro DB → defaults derivados do config (fail-safe total).
 */
export async function resolveEffectiveAuthMethods(
  settings: SettingsCapability,
  capabilities: AuthMethodsCapabilities = {}
): Promise<ResolvedAuthMethods> {
  const {
    configuredSocialProviders = [],
    magicLinkCapable = false,
    passkeyCapable = false,
  } = capabilities

  // Defaults derivados do config/capabilities.
  const configDefaults: ResolvedAuthMethods = {
    password: true,
    magicLink: magicLinkCapable,
    passkey: passkeyCapable,
    social: configuredSocialProviders,
    forgotPassword: true,
  }

  const raw = await settings.getSetting(SETTING_KEYS.AUTH_METHODS)
  if (raw === null || raw === undefined) return configDefaults
  if (typeof raw !== 'object' || Array.isArray(raw)) return configDefaults // shape inválida

  const s = raw as AuthMethodsSetting

  // Aplica campo a campo, com fallback ao default quando o campo está ausente.
  const passwordEnabled = typeof s.password === 'boolean' ? s.password : configDefaults.password
  const magicLinkEnabled = typeof s.magicLink === 'boolean' ? s.magicLink : configDefaults.magicLink
  const passkeyEnabled = typeof s.passkey === 'boolean' ? s.passkey : configDefaults.passkey

  // Social: interseção com os providers do config (setting não pode ligar o que não existe).
  let socialEnabled: string[]
  if (Array.isArray(s.social)) {
    socialEnabled = s.social.filter((p) => configuredSocialProviders.includes(p))
  } else {
    socialEnabled = configDefaults.social
  }

  // forgotPassword: derivado automaticamente — sem senha NUNCA existe esqueci-senha.
  const forgotPasswordEnabled =
    passwordEnabled && (typeof s.forgotPassword === 'boolean' ? s.forgotPassword : true)

  const resolved: ResolvedAuthMethods = {
    password: passwordEnabled,
    magicLink: magicLinkEnabled,
    passkey: passkeyEnabled,
    social: socialEnabled,
    forgotPassword: forgotPasswordEnabled,
  }

  // FAIL-SAFE all-off: se todos ficaram false/vazio, volta ao config derivado.
  const allOff =
    !resolved.password &&
    !resolved.magicLink &&
    !resolved.passkey &&
    resolved.social.length === 0
  if (allOff) {
    // eslint-disable-next-line no-console
    console.warn(
      '[authkit] auth_methods setting deixou todos os métodos desligados — ' +
        'revertendo para os defaults do config (fail-safe). ' +
        'Verifique a setting auth_methods no console admin.'
    )
    return configDefaults
  }

  return resolved
}

// ---------------------------------------------------------------------------
// 5. email_change setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `email_change` em `auth_settings`.
 *
 * Controla o fluxo de troca de e-mail verificada em runtime:
 *   - `enabled`:          habilita/desabilita o fluxo. Default: true (se a capability presente).
 *   - `ttlHours`:         duração do token de confirmação em horas. Default: 24.
 *   - `requirePassword`:  exige senha atual para iniciar a troca. Default: true.
 */
export interface EmailChangeSetting {
  enabled?: boolean
  ttlHours?: number
  requirePassword?: boolean
}

/** Resultado resolvido da setting email_change. */
export interface ResolvedEmailChangeSetting {
  enabled: boolean
  ttlHours: number
  requirePassword: boolean
}

/**
 * Resolve as configurações efetivas de troca de e-mail, combinando a setting
 * persistida em runtime com defaults.
 *
 * FAIL-SAFE: qualquer erro → defaults (enabled true, 24h, requirePassword true).
 */
export async function resolveEffectiveEmailChange(
  settings: SettingsCapability
): Promise<ResolvedEmailChangeSetting> {
  const defaults: ResolvedEmailChangeSetting = { enabled: true, ttlHours: 24, requirePassword: true }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.EMAIL_CHANGE)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as EmailChangeSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
      ttlHours: typeof s.ttlHours === 'number' && s.ttlHours > 0 ? s.ttlHours : defaults.ttlHours,
      requirePassword: typeof s.requirePassword === 'boolean' ? s.requirePassword : defaults.requirePassword,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 6. security_notifications setting
// ---------------------------------------------------------------------------

/**
 * Tipos de evento de segurança que disparam notificação por e-mail.
 */
export type SecurityNotificationKind =
  | 'password_changed'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'passkey_added'
  | 'passkey_removed'
  | 'email_changed'

/** Todos os tipos de notificação de segurança suportados. */
export const ALL_SECURITY_NOTIFICATION_KINDS: SecurityNotificationKind[] = [
  'password_changed',
  'mfa_enabled',
  'mfa_disabled',
  'passkey_added',
  'passkey_removed',
  'email_changed',
]

/**
 * Shape da setting `security_notifications` em `auth_settings`.
 *
 *   - `enabled`:  habilita/desabilita todas as notificações. Default: true.
 *   - `kinds`:    lista dos tipos de evento a notificar. Default: todos.
 */
export interface SecurityNotificationsSetting {
  enabled?: boolean
  kinds?: string[]
}

/** Resultado resolvido das notificações de segurança. */
export interface ResolvedSecurityNotifications {
  enabled: boolean
  kinds: SecurityNotificationKind[]
}

/**
 * Resolve as notificações de segurança efetivas, combinando a setting
 * persistida em runtime com defaults.
 *
 * FAIL-SAFE: qualquer erro → defaults (enabled true, todos os kinds).
 */
export async function resolveEffectiveSecurityNotifications(
  settings: SettingsCapability
): Promise<ResolvedSecurityNotifications> {
  const defaults: ResolvedSecurityNotifications = {
    enabled: true,
    kinds: [...ALL_SECURITY_NOTIFICATION_KINDS],
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.SECURITY_NOTIFICATIONS)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as SecurityNotificationsSetting
    const enabled = typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled
    let kinds: SecurityNotificationKind[]
    if (Array.isArray(s.kinds) && s.kinds.length > 0) {
      // Apenas aceita kinds válidos (interseção com os suportados).
      kinds = s.kinds.filter((k): k is SecurityNotificationKind =>
        (ALL_SECURITY_NOTIFICATION_KINDS as string[]).includes(k)
      )
      if (kinds.length === 0) kinds = [...ALL_SECURITY_NOTIFICATION_KINDS]
    } else {
      kinds = [...ALL_SECURITY_NOTIFICATION_KINDS]
    }
    return { enabled, kinds }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 7. password_history setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `password_history` em `auth_settings`.
 *
 * Quando `enabled: true` E a tabela `auth_password_history` existe (capability-
 * probed), a aplicação verifica os últimos `count` hashes ANTES de aceitar uma
 * nova senha e rejeita reutilização.
 *
 * Sem tabela → setting sem efeito; doctor explica o schema necessário.
 */
export interface PasswordHistorySetting {
  enabled?: boolean
  /** Quantos hashes anteriores verificar. Default: 5. */
  count?: number
}

/** Resultado resolvido de `password_history`. */
export interface ResolvedPasswordHistory {
  enabled: boolean
  /** Quantos hashes anteriores verificar (>= 1). */
  count: number
}

/**
 * Resolve as configurações efetivas de histórico de senhas.
 *
 * FAIL-SAFE: qualquer erro → `{ enabled: false, count: 5 }`.
 */
export async function resolveEffectivePasswordHistory(
  settings: SettingsCapability
): Promise<ResolvedPasswordHistory> {
  const defaults: ResolvedPasswordHistory = { enabled: false, count: 5 }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.PASSWORD_HISTORY)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as PasswordHistorySetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
      count: typeof s.count === 'number' && s.count >= 1 ? Math.floor(s.count) : defaults.count,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 8. password_expiration setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `password_expiration` em `auth_settings`.
 *
 * Quando `enabled: true` E a coluna `password_changed_at` existe (capability-
 * probed), força a troca de senha no login após `maxAgeDays` dias sem trocar.
 *
 * Sem coluna → setting sem efeito; doctor explica a migração necessária.
 */
export interface PasswordExpirationSetting {
  enabled?: boolean
  /** Máximo de dias desde a última troca. Default: 90. */
  maxAgeDays?: number
}

/** Resultado resolvido de `password_expiration`. */
export interface ResolvedPasswordExpiration {
  enabled: boolean
  /** Máximo de dias desde a última troca (>= 1). */
  maxAgeDays: number
}

/**
 * Resolve as configurações efetivas de expiração de senha.
 *
 * FAIL-SAFE: qualquer erro → `{ enabled: false, maxAgeDays: 90 }`.
 */
export async function resolveEffectivePasswordExpiration(
  settings: SettingsCapability
): Promise<ResolvedPasswordExpiration> {
  const defaults: ResolvedPasswordExpiration = { enabled: false, maxAgeDays: 90 }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.PASSWORD_EXPIRATION)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as PasswordExpirationSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
      maxAgeDays: typeof s.maxAgeDays === 'number' && s.maxAgeDays >= 1 ? Math.floor(s.maxAgeDays) : defaults.maxAgeDays,
    }
  } catch {
    return defaults
  }
}
