import React, { useState } from 'react'
import { SettingsSectionContainer, type SettingMeta } from '../containers/settings.containers'

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
  const [unavailable, setUnavailable] = useState(false)

  if (unavailable) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>Settings</div>
        <div className="error-box">
          Runtime settings require the <code>auth_settings</code> table. Run the migration to enable this feature.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-sub">Runtime configuration — changes take effect immediately</div>
      </div>

      {SETTING_SECTIONS.map((section) => (
        <SettingsSectionContainer
          key={section.title}
          section={section}
          onUnavailable={() => setUnavailable(true)}
        />
      ))}
    </div>
  )
}
