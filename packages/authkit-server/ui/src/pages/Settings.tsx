import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useSettingsQueryOptions,
  useSetSettingMutationOptions,
  useRemoveSettingMutationOptions,
  authkitKeys,
  type SettingEntry,
} from '@dudousxd/adonis-authkit-react'
import { useToast } from '../lib/toast'

// Setting schema with sections, descriptions, and types
interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'string' | 'json'
  defaultValue?: unknown
}

const SETTING_SECTIONS: Array<{ title: string; description: string; keys: SettingMeta[] }> = [
  {
    title: 'Authentication',
    description: 'Control sign-in and sign-up behavior',
    keys: [
      { key: 'auth.allow_registration', label: 'Allow Registration', description: 'New users can self-register', type: 'boolean', defaultValue: true },
      { key: 'auth.allow_password_login', label: 'Password Login', description: 'Users can log in with email + password', type: 'boolean', defaultValue: true },
      { key: 'auth.allow_magic_link', label: 'Magic Link', description: 'Enable passwordless login via email link', type: 'boolean', defaultValue: false },
      { key: 'auth.require_email_verification', label: 'Require Email Verification', description: 'New accounts must verify email before logging in', type: 'boolean', defaultValue: false },
      { key: 'auth.allow_social_login', label: 'Social Login', description: 'Enable OAuth social providers', type: 'boolean', defaultValue: false },
      { key: 'auth.social_auto_link', label: 'Auto-link Social Accounts', description: 'Automatically link social logins to existing accounts by email', type: 'boolean', defaultValue: false },
    ],
  },
  {
    title: 'Security',
    description: 'Password rules, MFA, and account protection',
    keys: [
      { key: 'security.require_mfa', label: 'Require MFA', description: 'All users must set up multi-factor authentication', type: 'boolean', defaultValue: false },
      { key: 'security.allow_totp', label: 'Allow TOTP', description: 'Enable TOTP authenticator app as MFA method', type: 'boolean', defaultValue: true },
      { key: 'security.allow_webauthn', label: 'Allow WebAuthn', description: 'Enable passkeys and hardware security keys', type: 'boolean', defaultValue: false },
      { key: 'security.password_min_length', label: 'Password Min Length', description: 'Minimum password length requirement', type: 'number', defaultValue: 8 },
      { key: 'security.password_block_common', label: 'Block Common Passwords', description: 'Reject passwords from the common passwords list', type: 'boolean', defaultValue: true },
      { key: 'security.max_login_attempts', label: 'Max Login Attempts', description: 'Lock account after N failed login attempts (0 = disabled)', type: 'number', defaultValue: 5 },
      { key: 'security.lockout_duration_minutes', label: 'Lockout Duration (minutes)', description: 'How long an account stays locked after too many failures', type: 'number', defaultValue: 30 },
      { key: 'security.sudo_grace_seconds', label: 'Sudo Grace Period (seconds)', description: 'How long sudo mode stays active after password confirmation', type: 'number', defaultValue: 900 },
    ],
  },
  {
    title: 'Sessions',
    description: 'Session lifetime and cookie behavior',
    keys: [
      { key: 'sessions.max_age_days', label: 'Session Max Age (days)', description: 'Session expires after N days of inactivity', type: 'number', defaultValue: 30 },
      { key: 'sessions.idle_timeout_minutes', label: 'Idle Timeout (minutes)', description: 'Log out after N minutes of inactivity (0 = disabled)', type: 'number', defaultValue: 0 },
      { key: 'sessions.allow_multiple', label: 'Allow Multiple Sessions', description: 'Users can be logged in from multiple devices', type: 'boolean', defaultValue: true },
    ],
  },
  {
    title: 'Communications',
    description: 'Email and notification settings',
    keys: [
      { key: 'email.from_name', label: 'From Name', description: 'Sender name for transactional emails', type: 'string', defaultValue: 'AuthKit' },
      { key: 'email.from_address', label: 'From Address', description: 'Sender email address', type: 'string', defaultValue: '' },
      { key: 'email.login_notify', label: 'Login Notifications', description: 'Send email when a new login is detected from an unknown device', type: 'boolean', defaultValue: false },
      { key: 'email.password_reset_expiry_minutes', label: 'Reset Link Expiry (minutes)', description: 'How long password reset links are valid', type: 'number', defaultValue: 60 },
    ],
  },
  {
    title: 'Advanced',
    description: 'Rate limiting, CORS, and advanced options',
    keys: [
      { key: 'rate_limit.login_per_minute', label: 'Login Rate Limit (per minute)', description: 'Max login attempts per IP per minute', type: 'number', defaultValue: 10 },
      { key: 'rate_limit.register_per_hour', label: 'Register Rate Limit (per hour)', description: 'Max registrations per IP per hour', type: 'number', defaultValue: 5 },
      { key: 'advanced.debug_mode', label: 'Debug Mode', description: 'Enable verbose error messages (never enable in production)', type: 'boolean', defaultValue: false },
      { key: 'advanced.trusted_proxies', label: 'Trusted Proxies', description: 'Comma-separated list of trusted proxy IPs for IP detection', type: 'string', defaultValue: '' },
    ],
  },
]

export function Settings() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [unavailable, setUnavailable] = useState(false)
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // ── Query ─────────────────────────────────────────────────────────────────────

  const { data, isLoading, error } = useQuery({
    ...useSettingsQueryOptions(),
    retry: (failureCount, err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        setUnavailable(true)
        return false
      }
      return failureCount < 1
    },
  })
  const settings = data?.data ?? []

  // Sync local values when settings load
  useEffect(() => {
    if (!data) return
    const initial: Record<string, unknown> = {}
    for (const s of data.data) initial[s.key] = s.value
    setLocalValues(initial)
    setDirtyKeys(new Set())
  }, [data])

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const setSettingMutation = useMutation(useSetSettingMutationOptions())
  const removeSettingMutation = useMutation(useRemoveSettingMutationOptions())

  function getValue(key: string, meta: SettingMeta): unknown {
    if (key in localValues) return localValues[key]
    const stored = settings.find((s) => s.key === key)
    if (stored) return stored.value
    return meta.defaultValue
  }

  function isDefault(key: string): boolean {
    return !settings.some((s) => s.key === key)
  }

  function setValue(key: string, value: unknown) {
    setLocalValues((prev) => ({ ...prev, [key]: value }))
    setDirtyKeys((prev) => new Set([...prev, key]))
  }

  async function saveSetting(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      const value = localValues[key]
      await setSettingMutation.mutateAsync({ key, value })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings() })
      setDirtyKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
      toast.success(`Saved: ${key}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function resetSetting(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      await removeSettingMutation.mutateAsync(key)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings() })
      setLocalValues((prev) => { const n = { ...prev }; delete n[key]; return n })
      setDirtyKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
      toast.success(`Reset to default: ${key}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  if (unavailable || (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404)) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>Settings</div>
        <div className="error-box">
          Runtime settings require the <code>auth_settings</code> table. Run the migration to enable this feature.
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="loading-row"><div className="spinner lg" /></div>
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">Runtime configuration — changes take effect immediately</div>
      </div>

      {SETTING_SECTIONS.map((section) => (
        <div key={section.title} className="settings-section">
          <div className="settings-section-head">
            <div>
              <h3>{section.title}</h3>
              <p style={{ marginTop: 2 }}>{section.description}</p>
            </div>
          </div>

          <div className="panel">
            <div className="panel-body" style={{ padding: 0 }}>
              {section.keys.map((meta) => {
                const val = getValue(meta.key, meta)
                const fromDefault = isDefault(meta.key)
                const isDirty = dirtyKeys.has(meta.key)
                const isSaving = saving[meta.key]

                return (
                  <div key={meta.key} className="settings-row">
                    <div className="settings-info">
                      <div className="settings-key">
                        {meta.label}
                        <span className="settings-badge">{fromDefault ? 'default' : 'custom'}</span>
                        {isDirty && <span className="settings-badge" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.3)' }}>unsaved</span>}
                      </div>
                      <div className="settings-desc">{meta.description}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>{meta.key}</div>
                    </div>

                    <div className="settings-control">
                      {meta.type === 'boolean' ? (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(val)}
                            onChange={(e) => setValue(meta.key, e.target.checked)}
                          />
                          <div className="toggle-track" />
                          <div className="toggle-thumb" />
                        </label>
                      ) : meta.type === 'number' ? (
                        <input
                          className="input input-mono"
                          type="number"
                          style={{ width: 90, textAlign: 'right' }}
                          value={String(val ?? meta.defaultValue ?? 0)}
                          onChange={(e) => setValue(meta.key, Number(e.target.value))}
                        />
                      ) : (
                        <input
                          className="input"
                          style={{ width: 200 }}
                          value={String(val ?? meta.defaultValue ?? '')}
                          onChange={(e) => setValue(meta.key, e.target.value)}
                        />
                      )}

                      {isDirty && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={isSaving}
                          onClick={() => saveSetting(meta.key)}
                        >
                          {isSaving ? <span className="spinner sm" /> : 'Save'}
                        </button>
                      )}

                      {!fromDefault && !isDirty && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={isSaving}
                          onClick={() => resetSetting(meta.key)}
                          title="Reset to default"
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M2 8a6 6 0 016-6 6 6 0 014.24 1.76L14 5" strokeLinecap="round" />
                            <path d="M14 2v3h-3" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
