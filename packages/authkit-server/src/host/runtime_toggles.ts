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
  SESSION_POLICY: 'session_policy',
  LOCKOUT: 'lockout',
  RATE_LIMIT: 'rate_limit',
  PASSWORD_POLICY: 'password_policy',
  NOTIFICATIONS: 'notifications',
  TRUSTED_DEVICES: 'trusted_devices',
  TOKEN_TTL: 'token_ttl',
  ADMIN_IMPERSONATION: 'admin_impersonation',
  ORGANIZATIONS_POLICY: 'organizations_policy',
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
// 9. session_policy setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `session_policy` em `auth_settings`.
 *
 * Controla o comportamento da sessão SSO do oidc-provider e da sessão do console
 * de conta em runtime, sem necessidade de redeploy.
 *
 * ### remember-me
 * Quando `rememberEnabled: true` (default), a tela de login exibe o checkbox
 * "manter conectado". Marcado → sessão persistente por `rememberDays` dias.
 * Desmarcado → sessão transiente (cookie expires ao fechar o browser) com duração
 * máxima de `defaultSessionHours` horas.
 *
 * ### single session
 * Quando `singleSession: true`, após um login bem-sucedido TODAS as outras sessões
 * OIDC da conta são revogadas (grants + tokens cascateados). A sessão RECÉM-CRIADA
 * é preservada. Auditado como `session.single_enforced`.
 *
 * ### idle timeout
 * Quando `idleTimeoutMinutes > 0`, o console de conta (e o console admin) registra
 * o timestamp da última atividade (`authkit_last_seen`) na sessão Adonis. A cada
 * request autenticado, se a inatividade exceder o limite, a sessão é encerrada e o
 * usuário é redirecionado ao login com uma mensagem i18n. Apenas o console de conta
 * é coberto — o lado OIDC (refresh tokens) tem vida própria e está fora de escopo.
 *
 * @remarks
 * A duração da sessão OIDC é controlada pelo TTL do oidc-provider, que é uma função
 * configurada em build_provider.ts e lê esta setting via um holder mutável atualizado
 * a cada save/reset desta setting. O TTL é **síncrono** no oidc-provider — não podemos
 * fazer leituras de DB no path. O holder é atualizado de forma assíncrona (após write)
 * e cacheado; num restart sem setting persistida, o provider usa o config estático.
 */
export interface SessionPolicySetting {
  /** Exibe checkbox "manter conectado" na tela de login. Default: true. */
  rememberEnabled?: boolean
  /** Duração da sessão quando "manter conectado" está marcado (dias). Default: 30. */
  rememberDays?: number
  /**
   * Duração máxima da sessão quando "manter conectado" NÃO está marcado (horas).
   * Default: derivado de `config.ttl.session` em horas (default 168 h = 7 dias).
   * Independente do remember, a sessão OIDC nunca excede este valor quando transiente.
   */
  defaultSessionHours?: number
  /** Força sessão única por conta: revoga outras sessões no login. Default: false. */
  singleSession?: boolean
  /**
   * Timeout de inatividade do console de conta (minutos). 0 = desligado. Default: 0.
   * O idle é rastreado pela sessão Adonis; não cobre o lado OIDC (tokens independentes).
   */
  idleTimeoutMinutes?: number
}

/** Resultado resolvido de `session_policy`. */
export interface ResolvedSessionPolicy {
  rememberEnabled: boolean
  rememberDays: number
  defaultSessionHours: number
  singleSession: boolean
  idleTimeoutMinutes: number
}

/** Defaults da session_policy quando a setting não existe. */
export const SESSION_POLICY_DEFAULTS: ResolvedSessionPolicy = {
  rememberEnabled: true,
  rememberDays: 30,
  defaultSessionHours: 168, // 7 dias em horas (= 604800 s padrão do oidc-provider)
  singleSession: false,
  idleTimeoutMinutes: 0,
}

/**
 * Resolve as configurações efetivas de session policy.
 *
 * FAIL-SAFE: qualquer erro → defaults (comportamento original intacto).
 *
 * @param configDefaultSessionHours Horas derivadas de `config.ttl.session` (em segundos → horas).
 *   Quando ausente, usa 168 h (7 dias = padrão do oidc-provider).
 */
export async function resolveEffectiveSessionPolicy(
  settings: SettingsCapability,
  configDefaultSessionHours?: number
): Promise<ResolvedSessionPolicy> {
  const defaults: ResolvedSessionPolicy = {
    ...SESSION_POLICY_DEFAULTS,
    defaultSessionHours: configDefaultSessionHours ?? SESSION_POLICY_DEFAULTS.defaultSessionHours,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.SESSION_POLICY)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as SessionPolicySetting
    return {
      rememberEnabled: typeof s.rememberEnabled === 'boolean' ? s.rememberEnabled : defaults.rememberEnabled,
      rememberDays: typeof s.rememberDays === 'number' && s.rememberDays >= 1 ? Math.floor(s.rememberDays) : defaults.rememberDays,
      defaultSessionHours: typeof s.defaultSessionHours === 'number' && s.defaultSessionHours >= 1 ? Math.floor(s.defaultSessionHours) : defaults.defaultSessionHours,
      singleSession: typeof s.singleSession === 'boolean' ? s.singleSession : defaults.singleSession,
      idleTimeoutMinutes: typeof s.idleTimeoutMinutes === 'number' && s.idleTimeoutMinutes >= 0 ? Math.floor(s.idleTimeoutMinutes) : defaults.idleTimeoutMinutes,
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

// ---------------------------------------------------------------------------
// 10. lockout setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `lockout` em `auth_settings`.
 *
 * Controla a política de bloqueio progressivo de conta em runtime. Os campos de
 * política (enabled, maxAttempts, windowSec, baseLockoutSec, maxLockoutSec) são
 * gerenciados aqui; o campo `store` do config estático é infra e NÃO é movido.
 *
 * FALLBACK: campos ausentes caem nos valores do `config.lockout` (via
 * `configDefault`) ou nos defaults da lib.
 */
export interface LockoutSetting {
  enabled?: boolean
  maxAttempts?: number
  windowSec?: number
  baseLockoutSec?: number
  maxLockoutSec?: number
}

/** Resultado resolvido de `lockout` (política apenas; store vem do config estático). */
export interface ResolvedLockoutSetting {
  enabled: boolean
  maxAttempts: number
  windowSec: number
  baseLockoutSec: number
  maxLockoutSec: number
}

/** Config default de lockout (valores que chegam do config estático). */
export interface LockoutConfigDefaults {
  enabled?: boolean
  maxAttempts?: number
  windowSec?: number
  baseLockoutSec?: number
  maxLockoutSec?: number
}

const LOCKOUT_LIB_DEFAULTS: ResolvedLockoutSetting = {
  enabled: true,
  maxAttempts: 5,
  windowSec: 900,
  baseLockoutSec: 60,
  maxLockoutSec: 3600,
}

/**
 * Resolve as configurações efetivas de lockout.
 *
 * Precedência: setting BD → configDefault → lib default.
 * FAIL-SAFE: qualquer erro → configDefault (ou lib defaults).
 */
export async function resolveEffectiveLockout(
  settings: SettingsCapability,
  configDefault: LockoutConfigDefaults = {}
): Promise<ResolvedLockoutSetting> {
  const defaults: ResolvedLockoutSetting = {
    enabled: configDefault.enabled ?? LOCKOUT_LIB_DEFAULTS.enabled,
    maxAttempts: configDefault.maxAttempts ?? LOCKOUT_LIB_DEFAULTS.maxAttempts,
    windowSec: configDefault.windowSec ?? LOCKOUT_LIB_DEFAULTS.windowSec,
    baseLockoutSec: configDefault.baseLockoutSec ?? LOCKOUT_LIB_DEFAULTS.baseLockoutSec,
    maxLockoutSec: configDefault.maxLockoutSec ?? LOCKOUT_LIB_DEFAULTS.maxLockoutSec,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.LOCKOUT)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as LockoutSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
      maxAttempts: typeof s.maxAttempts === 'number' && s.maxAttempts >= 1 ? Math.floor(s.maxAttempts) : defaults.maxAttempts,
      windowSec: typeof s.windowSec === 'number' && s.windowSec >= 1 ? Math.floor(s.windowSec) : defaults.windowSec,
      baseLockoutSec: typeof s.baseLockoutSec === 'number' && s.baseLockoutSec >= 1 ? Math.floor(s.baseLockoutSec) : defaults.baseLockoutSec,
      maxLockoutSec: typeof s.maxLockoutSec === 'number' && s.maxLockoutSec >= 1 ? Math.floor(s.maxLockoutSec) : defaults.maxLockoutSec,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 11. rate_limit setting
// ---------------------------------------------------------------------------

/**
 * Shape do bucket de rate-limit.
 */
export interface RateLimitBucketSetting {
  points?: number
  duration?: string
}

/**
 * Shape da setting `rate_limit` em `auth_settings`.
 *
 * LIMITAÇÃO CONHECIDA: O throttle do `@adonisjs/limiter` é construído NO
 * REGISTRO DA ROTA (boot-time) com os valores da config estática. O oidc-provider
 * e o Adonis não permitem alterar middlewares de rota em runtime. Por isso, os
 * valores de `rate_limit` da setting SÃO LIDOS pelo AccountLockout e pelo
 * middleware de throttle via função utilitária que é chamada por request, mas
 * APENAS no caminho do lockout/bloqueio — o middleware de throttle por IP (que
 * usa `@adonisjs/limiter` diretamente) CONTINUA usando a config estática.
 * Para throttle dinâmico verdadeiro, reconfigure e reinicie o servidor.
 *
 * Em termos práticos: `login.points`/`duration` e `introspection.points`/`duration`
 * AFETAM o comportamento do lockout (AccountLockout, que usa o limiter diretamente),
 * MAS o middleware de throttle de rota fica com a config de boot.
 *
 * @see resolveEffectiveRateLimit
 */
export interface RateLimitSetting {
  login?: RateLimitBucketSetting
  introspection?: RateLimitBucketSetting
}

/** Resultado resolvido do rate_limit (somente os buckets de política). */
export interface ResolvedRateLimitSetting {
  login: { points: number; duration: string }
  introspection: { points: number; duration: string }
}

export interface RateLimitConfigDefaults {
  login?: { points?: number; duration?: string }
  introspection?: { points?: number; duration?: string }
}

const RATE_LIMIT_LIB_DEFAULTS: ResolvedRateLimitSetting = {
  login: { points: 10, duration: '1 min' },
  introspection: { points: 60, duration: '1 min' },
}

/**
 * Resolve as configurações efetivas dos buckets de rate-limit.
 *
 * Precedência: setting BD → configDefault → lib default.
 * FAIL-SAFE: qualquer erro → configDefault.
 *
 * NOTA: o middleware de throttle de rota (Adonis) usa os valores do config de
 * boot e NÃO é afetado por esta setting em runtime. Veja JSDoc de RateLimitSetting.
 */
export async function resolveEffectiveRateLimit(
  settings: SettingsCapability,
  configDefault: RateLimitConfigDefaults = {}
): Promise<ResolvedRateLimitSetting> {
  const defaults: ResolvedRateLimitSetting = {
    login: {
      points: configDefault.login?.points ?? RATE_LIMIT_LIB_DEFAULTS.login.points,
      duration: configDefault.login?.duration ?? RATE_LIMIT_LIB_DEFAULTS.login.duration,
    },
    introspection: {
      points: configDefault.introspection?.points ?? RATE_LIMIT_LIB_DEFAULTS.introspection.points,
      duration: configDefault.introspection?.duration ?? RATE_LIMIT_LIB_DEFAULTS.introspection.duration,
    },
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.RATE_LIMIT)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as RateLimitSetting
    return {
      login: {
        points: typeof s.login?.points === 'number' && s.login.points >= 1 ? Math.floor(s.login.points) : defaults.login.points,
        duration: typeof s.login?.duration === 'string' && s.login.duration.trim() ? s.login.duration.trim() : defaults.login.duration,
      },
      introspection: {
        points: typeof s.introspection?.points === 'number' && s.introspection.points >= 1 ? Math.floor(s.introspection.points) : defaults.introspection.points,
        duration: typeof s.introspection?.duration === 'string' && s.introspection.duration.trim() ? s.introspection.duration.trim() : defaults.introspection.duration,
      },
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 12. password_policy setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `password_policy` em `auth_settings`.
 *
 * Controla as regras de complexidade de senha e checagem de vazamento.
 * Os campos `legacyVerifier`, `pepper` e `timeoutMs` do config estático são
 * infra/código e NÃO são movidos para a setting.
 *
 * FALLBACK: campos ausentes caem nos valores do `config.accountStore` password
 * config (via `configDefault`) ou nos defaults da lib.
 */
export interface PasswordPolicySetting {
  minLength?: number
  requireUppercase?: boolean
  requireLowercase?: boolean
  requireNumbers?: boolean
  requireSymbols?: boolean
  /** Verifica se a senha aparece em vazamentos (HaveIBeenPwned, k-anonymity). */
  checkPwned?: boolean
}

/** Resultado resolvido da password_policy. */
export interface ResolvedPasswordPolicySetting {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSymbols: boolean
  checkPwned: boolean
}

export interface PasswordPolicyConfigDefaults {
  minLength?: number
  requireUppercase?: boolean
  requireLowercase?: boolean
  requireNumbers?: boolean
  requireSymbols?: boolean
  checkPwned?: boolean
}

const PASSWORD_POLICY_LIB_DEFAULTS: ResolvedPasswordPolicySetting = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSymbols: false,
  checkPwned: false,
}

/**
 * Resolve as configurações efetivas de política de senha.
 *
 * Precedência: setting BD → configDefault → lib default.
 * FAIL-SAFE: qualquer erro → configDefault.
 */
export async function resolveEffectivePasswordPolicy(
  settings: SettingsCapability,
  configDefault: PasswordPolicyConfigDefaults = {}
): Promise<ResolvedPasswordPolicySetting> {
  const defaults: ResolvedPasswordPolicySetting = {
    minLength: configDefault.minLength ?? PASSWORD_POLICY_LIB_DEFAULTS.minLength,
    requireUppercase: configDefault.requireUppercase ?? PASSWORD_POLICY_LIB_DEFAULTS.requireUppercase,
    requireLowercase: configDefault.requireLowercase ?? PASSWORD_POLICY_LIB_DEFAULTS.requireLowercase,
    requireNumbers: configDefault.requireNumbers ?? PASSWORD_POLICY_LIB_DEFAULTS.requireNumbers,
    requireSymbols: configDefault.requireSymbols ?? PASSWORD_POLICY_LIB_DEFAULTS.requireSymbols,
    checkPwned: configDefault.checkPwned ?? PASSWORD_POLICY_LIB_DEFAULTS.checkPwned,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.PASSWORD_POLICY)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as PasswordPolicySetting
    return {
      minLength: typeof s.minLength === 'number' && s.minLength >= 1 ? Math.floor(s.minLength) : defaults.minLength,
      requireUppercase: typeof s.requireUppercase === 'boolean' ? s.requireUppercase : defaults.requireUppercase,
      requireLowercase: typeof s.requireLowercase === 'boolean' ? s.requireLowercase : defaults.requireLowercase,
      requireNumbers: typeof s.requireNumbers === 'boolean' ? s.requireNumbers : defaults.requireNumbers,
      requireSymbols: typeof s.requireSymbols === 'boolean' ? s.requireSymbols : defaults.requireSymbols,
      checkPwned: typeof s.checkPwned === 'boolean' ? s.checkPwned : defaults.checkPwned,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 13. notifications setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `notifications` em `auth_settings`.
 *
 * Controla se e-mails de alerta de novo acesso e novo dispositivo são enviados.
 * FALLBACK: campos ausentes caem nos valores do `config.notifications`.
 */
export interface NotificationsSetting {
  newLoginEmail?: boolean
  newDeviceEmail?: boolean
}

/** Resultado resolvido de `notifications`. */
export interface ResolvedNotificationsSetting {
  newLoginEmail: boolean
  newDeviceEmail: boolean
}

export interface NotificationsConfigDefaults {
  newLoginEmail?: boolean
  newDeviceEmail?: boolean
}

/**
 * Resolve as configurações efetivas de notificações de acesso/dispositivo.
 *
 * Precedência: setting BD → configDefault → lib default (true/true).
 * FAIL-SAFE: qualquer erro → configDefault.
 */
export async function resolveEffectiveNotifications(
  settings: SettingsCapability,
  configDefault: NotificationsConfigDefaults = {}
): Promise<ResolvedNotificationsSetting> {
  const defaults: ResolvedNotificationsSetting = {
    newLoginEmail: configDefault.newLoginEmail ?? true,
    newDeviceEmail: configDefault.newDeviceEmail ?? true,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.NOTIFICATIONS)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as NotificationsSetting
    return {
      newLoginEmail: typeof s.newLoginEmail === 'boolean' ? s.newLoginEmail : defaults.newLoginEmail,
      newDeviceEmail: typeof s.newDeviceEmail === 'boolean' ? s.newDeviceEmail : defaults.newDeviceEmail,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 14. trusted_devices setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `trusted_devices` em `auth_settings`.
 *
 * Controla a POLÍTICA de dispositivos confiáveis (enabled, days). Os campos de
 * infra (cookie name, segredos) continuam no config estático.
 *
 * FALLBACK: campos ausentes caem nos valores do `config.trustedDevices`.
 */
export interface TrustedDevicesSetting {
  enabled?: boolean
  days?: number
}

/** Resultado resolvido de `trusted_devices` (política). */
export interface ResolvedTrustedDevicesSetting {
  enabled: boolean
  days: number
}

export interface TrustedDevicesConfigDefaults {
  enabled?: boolean
  days?: number
}

/**
 * Resolve as configurações efetivas de trusted devices.
 *
 * Precedência: setting BD → configDefault → lib default (enabled=true, days=30).
 * FAIL-SAFE: qualquer erro → configDefault.
 */
export async function resolveEffectiveTrustedDevices(
  settings: SettingsCapability,
  configDefault: TrustedDevicesConfigDefaults = {}
): Promise<ResolvedTrustedDevicesSetting> {
  const defaults: ResolvedTrustedDevicesSetting = {
    enabled: configDefault.enabled ?? true,
    days: configDefault.days ?? 30,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.TRUSTED_DEVICES)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as TrustedDevicesSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
      days: typeof s.days === 'number' && s.days >= 1 ? Math.floor(s.days) : defaults.days,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 15. token_ttl setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `token_ttl` em `auth_settings`.
 *
 * Controla os TTLs dos tokens OIDC em runtime via holders mutáveis (mesmo padrão
 * do session_policy / sessionTtlHolder). Os holders são atualizados de forma
 * SÍNCRONA após um write/reset da setting — o oidc-provider lê os TTL functions
 * de forma síncrona, portanto os valores ficam disponíveis sem redeploy.
 *
 * Valores em SEGUNDOS. Campos ausentes caem nos valores do `config.ttl`.
 *
 * NOTA: session TTL JÁ é dinâmico via session_policy — NÃO duplique aqui.
 */
export interface TokenTtlSetting {
  accessTokenSec?: number
  idTokenSec?: number
  refreshTokenSec?: number
}

/** Resultado resolvido de `token_ttl`. */
export interface ResolvedTokenTtlSetting {
  accessTokenSec: number
  idTokenSec: number
  refreshTokenSec: number
}

export interface TokenTtlConfigDefaults {
  accessTokenSec?: number
  idTokenSec?: number
  refreshTokenSec?: number
}

/**
 * Resolve as configurações efetivas de TTL de tokens.
 *
 * Precedência: setting BD → configDefault → lib default (900s/900s/2592000s).
 * FAIL-SAFE: qualquer erro → configDefault.
 */
export async function resolveEffectiveTokenTtl(
  settings: SettingsCapability,
  configDefault: TokenTtlConfigDefaults = {}
): Promise<ResolvedTokenTtlSetting> {
  const defaults: ResolvedTokenTtlSetting = {
    accessTokenSec: configDefault.accessTokenSec ?? 900,
    idTokenSec: configDefault.idTokenSec ?? 900,
    refreshTokenSec: configDefault.refreshTokenSec ?? 2592000,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.TOKEN_TTL)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as TokenTtlSetting
    return {
      accessTokenSec: typeof s.accessTokenSec === 'number' && s.accessTokenSec >= 1 ? Math.floor(s.accessTokenSec) : defaults.accessTokenSec,
      idTokenSec: typeof s.idTokenSec === 'number' && s.idTokenSec >= 1 ? Math.floor(s.idTokenSec) : defaults.idTokenSec,
      refreshTokenSec: typeof s.refreshTokenSec === 'number' && s.refreshTokenSec >= 1 ? Math.floor(s.refreshTokenSec) : defaults.refreshTokenSec,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 16. admin_impersonation setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `admin_impersonation` em `auth_settings`.
 *
 * Controla se o painel de impersonation (RFC 8693 token exchange) é exibido no
 * console admin. FALLBACK: campo ausente cai em `config.admin.impersonation`.
 */
export interface AdminImpersonationSetting {
  enabled?: boolean
}

/** Resultado resolvido de `admin_impersonation`. */
export interface ResolvedAdminImpersonationSetting {
  enabled: boolean
}

/**
 * Resolve as configurações efetivas de impersonation.
 *
 * Precedência: setting BD → configDefault → lib default (false).
 * FAIL-SAFE: qualquer erro → configDefault.
 */
export async function resolveEffectiveAdminImpersonation(
  settings: SettingsCapability,
  configDefault: boolean = false
): Promise<ResolvedAdminImpersonationSetting> {
  const defaults: ResolvedAdminImpersonationSetting = { enabled: configDefault }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.ADMIN_IMPERSONATION)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as AdminImpersonationSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : defaults.enabled,
    }
  } catch {
    return defaults
  }
}

// ---------------------------------------------------------------------------
// 17. organizations_policy setting
// ---------------------------------------------------------------------------

/**
 * Shape da setting `organizations_policy` em `auth_settings`.
 *
 * Controla as POLÍTICAS de organizações em runtime (allowSelfCreate,
 * invitationTtlHours, roles). O campo `enabled` da capability e a derivação de
 * tabelas ficam no config estático / capability-probing. FALLBACK: campos
 * ausentes caem nos valores do `config.organizations`.
 */
export interface OrganizationsPolicySetting {
  allowSelfCreate?: boolean
  invitationTtlHours?: number
  roles?: string[]
}

/** Resultado resolvido de `organizations_policy`. */
export interface ResolvedOrganizationsPolicySetting {
  allowSelfCreate: boolean
  invitationTtlHours: number
  roles: string[]
}

export interface OrganizationsPolicyConfigDefaults {
  allowSelfCreate?: boolean
  invitationTtlHours?: number
  roles?: string[]
}

const ORGS_POLICY_LIB_DEFAULTS: ResolvedOrganizationsPolicySetting = {
  allowSelfCreate: false,
  invitationTtlHours: 168,
  roles: ['owner', 'admin', 'member'],
}

/**
 * Resolve as configurações efetivas de política de organizações.
 *
 * Precedência: setting BD → configDefault → lib default.
 * FAIL-SAFE: qualquer erro → configDefault.
 *
 * Invariante mantida: 'owner' é sempre incluído na lista de roles (governance).
 */
export async function resolveEffectiveOrganizationsPolicy(
  settings: SettingsCapability,
  configDefault: OrganizationsPolicyConfigDefaults = {}
): Promise<ResolvedOrganizationsPolicySetting> {
  const defaultRoles = configDefault.roles ?? ORGS_POLICY_LIB_DEFAULTS.roles
  const rolesWithOwner = defaultRoles.includes('owner') ? defaultRoles : ['owner', ...defaultRoles]
  const defaults: ResolvedOrganizationsPolicySetting = {
    allowSelfCreate: configDefault.allowSelfCreate ?? ORGS_POLICY_LIB_DEFAULTS.allowSelfCreate,
    invitationTtlHours: configDefault.invitationTtlHours ?? ORGS_POLICY_LIB_DEFAULTS.invitationTtlHours,
    roles: rolesWithOwner,
  }
  try {
    const raw = await settings.getSetting(SETTING_KEYS.ORGANIZATIONS_POLICY)
    if (raw === null || raw === undefined) return defaults
    if (typeof raw !== 'object' || Array.isArray(raw)) return defaults
    const s = raw as OrganizationsPolicySetting
    // Roles: usa o valor da setting apenas se for um array não-vazio; sempre
    // garante que 'owner' está presente (invariante de governance).
    let roles = defaults.roles
    if (Array.isArray(s.roles) && s.roles.length > 0) {
      roles = s.roles.includes('owner') ? s.roles : ['owner', ...s.roles]
    }
    return {
      allowSelfCreate: typeof s.allowSelfCreate === 'boolean' ? s.allowSelfCreate : defaults.allowSelfCreate,
      invitationTtlHours: typeof s.invitationTtlHours === 'number' && s.invitationTtlHours >= 1 ? Math.floor(s.invitationTtlHours) : defaults.invitationTtlHours,
      roles,
    }
  } catch {
    return defaults
  }
}
