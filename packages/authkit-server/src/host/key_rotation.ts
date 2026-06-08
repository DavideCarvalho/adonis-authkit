import type { SettingsCapability } from './runtime_settings.js'
import { SETTING_KEYS } from './runtime_toggles.js'

export interface KeyRotationSetting {
  enabled?: boolean
  maxAgeDays?: number
  keep?: number
}
export interface ResolvedKeyRotationSetting {
  enabled: boolean
  maxAgeDays: number
  keep: number
}
export const KEY_ROTATION_DEFAULTS: ResolvedKeyRotationSetting = {
  enabled: false,
  maxAgeDays: 90,
  keep: 2,
}

/** Resolve a setting `key_rotation` em runtime (fail-safe → defaults). */
export async function resolveEffectiveKeyRotation(
  settings: SettingsCapability
): Promise<ResolvedKeyRotationSetting> {
  try {
    const raw = await settings.getSetting(SETTING_KEYS.KEY_ROTATION)
    if (raw === null || raw === undefined) return KEY_ROTATION_DEFAULTS
    if (typeof raw !== 'object' || Array.isArray(raw)) return KEY_ROTATION_DEFAULTS
    const s = raw as KeyRotationSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : KEY_ROTATION_DEFAULTS.enabled,
      maxAgeDays:
        typeof s.maxAgeDays === 'number' && s.maxAgeDays >= 1
          ? Math.floor(s.maxAgeDays)
          : KEY_ROTATION_DEFAULTS.maxAgeDays,
      keep:
        typeof s.keep === 'number' && s.keep >= 1 ? Math.floor(s.keep) : KEY_ROTATION_DEFAULTS.keep,
    }
  } catch {
    return KEY_ROTATION_DEFAULTS
  }
}
