/**
 * Sudo mode (confirm_password + grace period).
 *
 * Após confirmar a identidade (senha ou passkey), o helper `requireSudo` registra
 * o timestamp na sessão Adonis. Dentro da janela de graça (`graceMinutes`) a
 * confirmação é aceita; fora dela, o usuário é redirecionado para `/account/confirm`.
 *
 * Setting `sudo_mode`:
 *   - `enabled`:      habilita/desabilita o sudo mode. Default: true.
 *   - `graceMinutes`: janela de graça em minutos. Default: 15.
 *
 * Chave de sessão: `authkit_sudo_at` (timestamp ms).
 */

import type { HttpContext } from '@adonisjs/core/http'
import type { SettingsCapability } from './runtime_settings.js'
import { SETTING_KEYS } from './runtime_toggles.js'

// ---------------------------------------------------------------------------
// Setting shape + resolver
// ---------------------------------------------------------------------------

export interface SudoModeSetting {
  enabled?: boolean
  graceMinutes?: number
}

export interface ResolvedSudoModeSetting {
  enabled: boolean
  graceMinutes: number
}

export const SUDO_MODE_DEFAULTS: ResolvedSudoModeSetting = {
  enabled: true,
  graceMinutes: 15,
}

/**
 * Resolve a setting `sudo_mode` em runtime (fail-safe).
 */
export async function resolveEffectiveSudoMode(
  settings: SettingsCapability
): Promise<ResolvedSudoModeSetting> {
  try {
    const raw = await settings.getSetting(SETTING_KEYS.SUDO_MODE)
    if (raw === null || raw === undefined) return SUDO_MODE_DEFAULTS
    if (typeof raw !== 'object' || Array.isArray(raw)) return SUDO_MODE_DEFAULTS
    const s = raw as SudoModeSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : SUDO_MODE_DEFAULTS.enabled,
      graceMinutes:
        typeof s.graceMinutes === 'number' && s.graceMinutes >= 0
          ? Math.floor(s.graceMinutes)
          : SUDO_MODE_DEFAULTS.graceMinutes,
    }
  } catch {
    return SUDO_MODE_DEFAULTS
  }
}

// ---------------------------------------------------------------------------
// Session key + helpers
// ---------------------------------------------------------------------------

/** Chave da sessão Adonis que registra quando o sudo foi confirmado. */
export const SUDO_SESSION_KEY = 'authkit_sudo_at'

/**
 * Registra o timestamp de confirmação de sudo na sessão (NOW).
 * Chamar após o usuário confirmar sua identidade (senha ou passkey).
 */
export function markSudo(ctx: HttpContext): void {
  ctx.session.put(SUDO_SESSION_KEY, Date.now())
}

/**
 * Verifica se o sudo está ativo (dentro da janela de graça).
 *
 * @returns `true` se o sudo está ativo (dentro da graça); `false` caso contrário.
 */
export function isSudoActive(ctx: HttpContext, graceMinutes: number): boolean {
  const sudoAt = ctx.session.get(SUDO_SESSION_KEY) as number | undefined
  if (!sudoAt) return false
  const graceMs = graceMinutes * 60 * 1000
  return Date.now() - sudoAt <= graceMs
}

/**
 * Guard de sudo mode. Verifica se a confirmação de identidade está ativa e
 * dentro da janela de graça. Se estiver, retorna `true`. Se não, redireciona
 * para `/account/confirm?return_to=<path atual>` e retorna a resposta.
 *
 * Uso:
 * ```ts
 * const result = await requireSudo(ctx, settings)
 * if (result !== true) return result
 * ```
 *
 * FAIL-SAFE: qualquer erro lê settings → retorna `true` (deixa passar).
 * Quando `sudo_mode.enabled = false`, sempre retorna `true`.
 */
export async function requireSudo(
  ctx: HttpContext,
  settings: SettingsCapability | null
): Promise<true | unknown> {
  try {
    const cfg = settings ? await resolveEffectiveSudoMode(settings) : SUDO_MODE_DEFAULTS
    if (!cfg.enabled) return true
    if (isSudoActive(ctx, cfg.graceMinutes)) return true
  } catch {
    // FAIL-SAFE: erro ao resolver a setting → deixa passar.
    return true
  }

  // Fora da graça: redireciona para confirmação.
  const rawUrl = ctx.request.url?.() ?? ''
  const qs = (ctx.request as any).parsedUrl?.search ?? ''
  const dest = qs ? `${rawUrl}${qs}` : rawUrl
  const returnTo =
    dest && dest !== '/' && !dest.startsWith('/account/confirm')
      ? `?return_to=${encodeURIComponent(dest)}`
      : ''
  return ctx.response.redirect(`/account/confirm${returnTo}`)
}

/**
 * Resolve um RuntimeSettings a partir do container HTTP (helper para controllers).
 * Retorna `null` se o container não estiver disponível.
 */
export async function getRuntimeSettingsForSudo(ctx: HttpContext): Promise<SettingsCapability | null> {
  try {
    const { RuntimeSettings } = await import('./runtime_settings.js')
    const db = await ctx.containerResolver.make('lucid.db')
    const service = await ctx.containerResolver.make('authkit.server').catch(() => null)
    const connection: string | undefined = (service?.config?.accountStore as any)?.connectionName
    return new RuntimeSettings(db, connection ? { connection } : {})
  } catch {
    return null
  }
}
