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
 */
export interface RequireVerifiedEmailSetting {
  enabled: boolean
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
