import { randomBytes } from 'node:crypto'

/**
 * "Trusted devices" — pular o 2º fator (MFA) neste dispositivo por N dias.
 *
 * Mecanismo SEM novos requisitos de DB: um cookie httpOnly assinado/encriptado
 * com a appKey do host (via `response.encryptedCookie` / `request.encryptedCookie`,
 * que são appKey-backed). O cookie carrega `{ a: accountId, d: deviceId, iat, exp }`.
 *
 * Validação (ver {@link isTrustedDeviceValid}):
 *   - `exp` ainda no futuro;
 *   - `a` casa com a conta que acabou de passar pela senha;
 *   - `iat >= mfaEnabledAt` — re-enrolar o MFA invalida cookies antigos (revogação
 *     por re-enrollment, sem estado server-side).
 *
 * Step-up (acr_values pedindo o mfaAcr) SEMPRE ignora o cookie e força o MFA — a
 * decisão fica no controller, antes de checar o cookie.
 *
 * Limitação conhecida (documentada): NÃO há uma lista de revogação por-dispositivo
 * server-side; a revogação disponível é "revogar todos" via re-enrollment do MFA.
 * Uma allowlist/denylist persistida fica como trabalho futuro.
 */

/** Nome do cookie de dispositivo confiável. */
export const TRUSTED_DEVICE_COOKIE = 'authkit_trusted_device'

/** Payload guardado (encriptado) no cookie de dispositivo confiável. */
export interface TrustedDevicePayload {
  /** accountId ao qual a confiança pertence. */
  a: string
  /** id opaco do dispositivo (para futura revogação por-dispositivo). */
  d: string
  /** issued-at (epoch ms). */
  iat: number
  /** expiry (epoch ms). */
  exp: number
}

/**
 * Infra de trusted devices. Política (enabled, days) é gerenciada em runtime
 * via setting `trusted_devices` no admin console ou Admin API.
 */
export interface TrustedDevicesConfigInput {
  // Infra/crypto — reservado para futuros parâmetros de cookie (ex.: nome, algoritmo).
}

export interface ResolvedTrustedDevicesConfig {
  enabled: boolean
  days: number
}

export function resolveTrustedDevices(
  _input?: TrustedDevicesConfigInput
): ResolvedTrustedDevicesConfig {
  return {
    enabled: true,
    days: 30,
  }
}

/** Constrói o payload de um novo cookie de confiança para a conta. */
export function buildTrustedDevicePayload(
  accountId: string,
  cfg: ResolvedTrustedDevicesConfig,
  now: number = Date.now()
): TrustedDevicePayload {
  return {
    a: accountId,
    d: randomBytes(16).toString('hex'),
    iat: now,
    exp: now + cfg.days * 24 * 60 * 60 * 1000,
  }
}

/**
 * `true` se o payload do cookie é uma confiança VÁLIDA para `accountId`:
 *   - estrutura íntegra;
 *   - pertence à conta certa;
 *   - não expirou;
 *   - foi emitido em/depois do último (re)enrollment de MFA (`mfaEnabledAt`).
 *
 * `mfaEnabledAt` em epoch ms (ou null quando o store não rastreia — nesse caso a
 * checagem de re-enrollment é pulada, mantendo a validade por expiração apenas).
 */
export function isTrustedDeviceValid(
  payload: unknown,
  opts: { accountId: string; mfaEnabledAt?: number | null; now?: number }
): boolean {
  const now = opts.now ?? Date.now()
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Partial<TrustedDevicePayload>
  if (typeof p.a !== 'string' || typeof p.iat !== 'number' || typeof p.exp !== 'number') {
    return false
  }
  if (p.a !== opts.accountId) return false
  if (p.exp <= now) return false
  // Re-enrollment do MFA revoga cookies emitidos antes dele.
  if (typeof opts.mfaEnabledAt === 'number' && p.iat < opts.mfaEnabledAt) return false
  return true
}
