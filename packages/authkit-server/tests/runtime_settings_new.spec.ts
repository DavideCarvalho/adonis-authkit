/**
 * Tests for new runtime settings (mission 4/5):
 *   lockout, rate_limit, password_policy, notifications, trusted_devices,
 *   token_ttl, admin_impersonation, organizations_policy
 * Also tests: TokenTtlHolder, checkLegacyPolicyConfig doctor check,
 *   settings CLI commands (settingsList/settingsGet/settingsSet/settingsUnset).
 */

import { test } from '@japa/runner'
import { RuntimeSettings } from '../src/host/runtime_settings.js'
import {
  resolveEffectiveLockout,
  resolveEffectiveRateLimit,
  resolveEffectivePasswordPolicy,
  resolveEffectiveNotifications,
  resolveEffectiveTrustedDevices,
  resolveEffectiveTokenTtl,
  resolveEffectiveAdminImpersonation,
  resolveEffectiveOrganizationsPolicy,
  SETTING_KEYS,
} from '../src/host/runtime_toggles.js'
import {
  updateTokenTtlHolder,
  type TokenTtlHolder,
} from '../src/provider/build_provider.js'
import {
  checkLegacyPolicyConfig,
  type DoctorInput,
} from '../src/doctor/checks.js'
import {
  settingsList,
  settingsGet,
  settingsSet,
  settingsUnset,
} from '../src/commands/settings_commands.js'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fakeDb(rows: Record<string, unknown> = {}) {
  const store = new Map<string, { value: string; updated_at: Date; updated_by: string | null }>(
    Object.entries(rows).map(([k, v]) => [k, { value: JSON.stringify(v), updated_at: new Date(), updated_by: null }])
  )
  return {
    _hasTable: true,
    from(name: string) { return this.table(name) },
    table(_name: string) {
      const allRows = () => [...store.entries()].map(([key, v]) => ({ key, value: v.value, updated_at: v.updated_at, updated_by: v.updated_by }))
      return {
        where(_col: string, key: string) {
          return {
            async first() {
              const v = store.get(key)
              return v ? { key, value: v.value, updated_at: v.updated_at, updated_by: v.updated_by } : null
            },
            async delete() { store.delete(key) },
          }
        },
        async insert(row: any) {
          store.set(row.key, { value: row.value, updated_at: row.updated_at ?? new Date(), updated_by: row.updated_by ?? null })
        },
        // select() returns a chainable object (supports .limit()) for the probe.
        select(_cols?: string) {
          const rows = allRows()
          return {
            limit(_n: number) { return Promise.resolve(rows.slice(0, _n)) },
            then(resolve: any, reject: any) { return Promise.resolve(rows).then(resolve, reject) },
          }
        },
      }
    },
    __store: store,
  }
}

function noTableDb() {
  return {
    // table() throws → probe catches → tablePresent = false.
    from() { return this.table() },
    table() { throw new Error('table does not exist') },
  }
}

function settings(rows: Record<string, unknown> = {}) {
  return new RuntimeSettings(fakeDb(rows) as any)
}

function noTableSettings() {
  return new RuntimeSettings(noTableDb() as any)
}

// Fake app for CLI command tests
function fakeApp(rows: Record<string, unknown> = {}) {
  const db = fakeDb(rows)
  return {
    container: {
      async make(key: string) {
        if (key === 'lucid.db') return db
        if (key === 'config') return { get: () => null }
        throw new Error(`unknown key: ${key}`)
      },
    },
    config: { get: () => null },
    __db: db,
  }
}

// ---------------------------------------------------------------------------
// lockout setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveLockout', () => {
  test('setting absent — returns config default', async ({ assert }) => {
    const result = await resolveEffectiveLockout(noTableSettings(), { enabled: false, maxAttempts: 3 })
    assert.equal(result.enabled, false)
    assert.equal(result.maxAttempts, 3)
  })

  test('setting present — overrides all fields', async ({ assert }) => {
    const svc = settings({ lockout: { enabled: false, maxAttempts: 10, windowSec: 300, baseLockoutSec: 120, maxLockoutSec: 7200 } })
    const result = await resolveEffectiveLockout(svc)
    assert.equal(result.enabled, false)
    assert.equal(result.maxAttempts, 10)
    assert.equal(result.windowSec, 300)
    assert.equal(result.baseLockoutSec, 120)
    assert.equal(result.maxLockoutSec, 7200)
  })

  test('setting partially present — merges with config defaults', async ({ assert }) => {
    const svc = settings({ lockout: { maxAttempts: 7 } })
    const result = await resolveEffectiveLockout(svc, { enabled: false, windowSec: 600 })
    // maxAttempts from setting; enabled from config default; windowSec from config default
    assert.equal(result.maxAttempts, 7)
    assert.equal(result.enabled, false)
    assert.equal(result.windowSec, 600)
  })

  test('DB error (fail-safe) — returns config defaults', async ({ assert }) => {
    const svc = new RuntimeSettings({
      async connection() { throw new Error('db down') },
      from() { return this.table() },
      table() { throw new Error('db down') },
    } as any)
    const result = await resolveEffectiveLockout(svc, { enabled: false, maxAttempts: 3 })
    assert.equal(result.enabled, false)
    assert.equal(result.maxAttempts, 3)
  })

  test('invalid shape — returns defaults', async ({ assert }) => {
    const svc = settings({ lockout: 'bad' })
    const result = await resolveEffectiveLockout(svc, { maxAttempts: 2 })
    assert.equal(result.maxAttempts, 2)
  })

  test('lib defaults when no config default', async ({ assert }) => {
    const svc = noTableSettings()
    const result = await resolveEffectiveLockout(svc)
    assert.equal(result.enabled, true)
    assert.equal(result.maxAttempts, 5)
    assert.equal(result.windowSec, 900)
    assert.equal(result.baseLockoutSec, 60)
    assert.equal(result.maxLockoutSec, 3600)
  })
})

// ---------------------------------------------------------------------------
// rate_limit setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveRateLimit', () => {
  test('setting absent — returns config default', async ({ assert }) => {
    const result = await resolveEffectiveRateLimit(noTableSettings(), { login: { points: 5, duration: '2 min' } })
    assert.equal(result.login.points, 5)
    assert.equal(result.login.duration, '2 min')
  })

  test('setting present — overrides buckets', async ({ assert }) => {
    const svc = settings({ rate_limit: { login: { points: 20, duration: '5 min' }, introspection: { points: 100, duration: '2 min' } } })
    const result = await resolveEffectiveRateLimit(svc)
    assert.equal(result.login.points, 20)
    assert.equal(result.login.duration, '5 min')
    assert.equal(result.introspection.points, 100)
    assert.equal(result.introspection.duration, '2 min')
  })

  test('invalid shape — returns defaults', async ({ assert }) => {
    const svc = settings({ rate_limit: 'invalid' })
    const result = await resolveEffectiveRateLimit(svc)
    assert.equal(result.login.points, 10) // lib default
  })

  test('lib defaults when no config default', async ({ assert }) => {
    const result = await resolveEffectiveRateLimit(noTableSettings())
    assert.equal(result.login.points, 10)
    assert.equal(result.login.duration, '1 min')
    assert.equal(result.introspection.points, 60)
  })
})

// ---------------------------------------------------------------------------
// password_policy setting
// ---------------------------------------------------------------------------

test.group('resolveEffectivePasswordPolicy', () => {
  test('setting absent — returns config defaults', async ({ assert }) => {
    const result = await resolveEffectivePasswordPolicy(noTableSettings(), { minLength: 12, requireUppercase: true })
    assert.equal(result.minLength, 12)
    assert.equal(result.requireUppercase, true)
  })

  test('setting present — overrides all fields', async ({ assert }) => {
    const svc = settings({ password_policy: { minLength: 16, requireUppercase: true, requireLowercase: true, requireNumbers: true, requireSymbols: true, checkPwned: true } })
    const result = await resolveEffectivePasswordPolicy(svc)
    assert.equal(result.minLength, 16)
    assert.isTrue(result.requireUppercase)
    assert.isTrue(result.requireLowercase)
    assert.isTrue(result.requireNumbers)
    assert.isTrue(result.requireSymbols)
    assert.isTrue(result.checkPwned)
  })

  test('setting off — overrides to false', async ({ assert }) => {
    const svc = settings({ password_policy: { checkPwned: false, requireUppercase: false } })
    const result = await resolveEffectivePasswordPolicy(svc, { checkPwned: true, requireUppercase: true })
    assert.isFalse(result.checkPwned)
    assert.isFalse(result.requireUppercase)
  })

  test('invalid minLength — falls back to config default', async ({ assert }) => {
    const svc = settings({ password_policy: { minLength: 'bad' } })
    const result = await resolveEffectivePasswordPolicy(svc, { minLength: 10 })
    assert.equal(result.minLength, 10)
  })

  test('lib defaults when no config default', async ({ assert }) => {
    const result = await resolveEffectivePasswordPolicy(noTableSettings())
    assert.equal(result.minLength, 8)
    assert.isFalse(result.requireUppercase)
    assert.isFalse(result.checkPwned)
  })
})

// ---------------------------------------------------------------------------
// notifications setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveNotifications', () => {
  test('setting absent — returns config defaults', async ({ assert }) => {
    const result = await resolveEffectiveNotifications(noTableSettings(), { newLoginEmail: false, newDeviceEmail: true })
    assert.isFalse(result.newLoginEmail)
    assert.isTrue(result.newDeviceEmail)
  })

  test('setting present — overrides', async ({ assert }) => {
    const svc = settings({ notifications: { newLoginEmail: false, newDeviceEmail: false } })
    const result = await resolveEffectiveNotifications(svc)
    assert.isFalse(result.newLoginEmail)
    assert.isFalse(result.newDeviceEmail)
  })

  test('DB error — returns config defaults', async ({ assert }) => {
    const svc = new RuntimeSettings({
      async connection() { throw new Error('db down') },
      from() { return this.table() },
      table() { throw new Error('db down') },
    } as any)
    const result = await resolveEffectiveNotifications(svc, { newLoginEmail: false })
    assert.isFalse(result.newLoginEmail)
  })

  test('lib defaults (true/true) when no config default', async ({ assert }) => {
    const result = await resolveEffectiveNotifications(noTableSettings())
    assert.isTrue(result.newLoginEmail)
    assert.isTrue(result.newDeviceEmail)
  })
})

// ---------------------------------------------------------------------------
// trusted_devices setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveTrustedDevices', () => {
  test('setting absent — returns config defaults', async ({ assert }) => {
    const result = await resolveEffectiveTrustedDevices(noTableSettings(), { enabled: false, days: 7 })
    assert.isFalse(result.enabled)
    assert.equal(result.days, 7)
  })

  test('setting present — overrides', async ({ assert }) => {
    const svc = settings({ trusted_devices: { enabled: true, days: 60 } })
    const result = await resolveEffectiveTrustedDevices(svc)
    assert.isTrue(result.enabled)
    assert.equal(result.days, 60)
  })

  test('setting disabled — overrides config default enabled', async ({ assert }) => {
    const svc = settings({ trusted_devices: { enabled: false } })
    const result = await resolveEffectiveTrustedDevices(svc, { enabled: true, days: 14 })
    assert.isFalse(result.enabled)
    assert.equal(result.days, 14) // days from config default (not in setting)
  })

  test('lib defaults (enabled=true, days=30)', async ({ assert }) => {
    const result = await resolveEffectiveTrustedDevices(noTableSettings())
    assert.isTrue(result.enabled)
    assert.equal(result.days, 30)
  })
})

// ---------------------------------------------------------------------------
// token_ttl setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveTokenTtl', () => {
  test('setting absent — returns config defaults', async ({ assert }) => {
    const result = await resolveEffectiveTokenTtl(noTableSettings(), { accessTokenSec: 1800, idTokenSec: 600, refreshTokenSec: 86400 })
    assert.equal(result.accessTokenSec, 1800)
    assert.equal(result.idTokenSec, 600)
    assert.equal(result.refreshTokenSec, 86400)
  })

  test('setting present — overrides all', async ({ assert }) => {
    const svc = settings({ token_ttl: { accessTokenSec: 3600, idTokenSec: 1800, refreshTokenSec: 604800 } })
    const result = await resolveEffectiveTokenTtl(svc)
    assert.equal(result.accessTokenSec, 3600)
    assert.equal(result.idTokenSec, 1800)
    assert.equal(result.refreshTokenSec, 604800)
  })

  test('partial setting — only overrides present fields', async ({ assert }) => {
    const svc = settings({ token_ttl: { accessTokenSec: 2700 } })
    const result = await resolveEffectiveTokenTtl(svc, { accessTokenSec: 900, idTokenSec: 600, refreshTokenSec: 86400 })
    assert.equal(result.accessTokenSec, 2700) // from setting
    assert.equal(result.idTokenSec, 600)      // from config default
    assert.equal(result.refreshTokenSec, 86400) // from config default
  })

  test('lib defaults (900/900/2592000)', async ({ assert }) => {
    const result = await resolveEffectiveTokenTtl(noTableSettings())
    assert.equal(result.accessTokenSec, 900)
    assert.equal(result.idTokenSec, 900)
    assert.equal(result.refreshTokenSec, 2592000)
  })

  test('invalid value — falls back to config default', async ({ assert }) => {
    const svc = settings({ token_ttl: { accessTokenSec: -10 } })
    const result = await resolveEffectiveTokenTtl(svc, { accessTokenSec: 1800 })
    assert.equal(result.accessTokenSec, 1800)
  })
})

// ---------------------------------------------------------------------------
// TokenTtlHolder
// ---------------------------------------------------------------------------

test.group('TokenTtlHolder', () => {
  test('updateTokenTtlHolder updates all fields', ({ assert }) => {
    const holder: TokenTtlHolder = { accessTokenSec: 900, idTokenSec: 900, refreshTokenSec: 2592000 }
    updateTokenTtlHolder(holder, { accessTokenSec: 3600, idTokenSec: 1800, refreshTokenSec: 86400 })
    assert.equal(holder.accessTokenSec, 3600)
    assert.equal(holder.idTokenSec, 1800)
    assert.equal(holder.refreshTokenSec, 86400)
  })

  test('updateTokenTtlHolder enforces minimum of 1', ({ assert }) => {
    const holder: TokenTtlHolder = { accessTokenSec: 900, idTokenSec: 900, refreshTokenSec: 2592000 }
    updateTokenTtlHolder(holder, { accessTokenSec: 0, idTokenSec: -5, refreshTokenSec: 1 })
    assert.equal(holder.accessTokenSec, 1)
    assert.equal(holder.idTokenSec, 1)
    assert.equal(holder.refreshTokenSec, 1)
  })

  test('updateTokenTtlHolder does not affect other fields', ({ assert }) => {
    const holder: TokenTtlHolder = { accessTokenSec: 100, idTokenSec: 200, refreshTokenSec: 300 }
    updateTokenTtlHolder(holder, { accessTokenSec: 100, idTokenSec: 200, refreshTokenSec: 999 })
    assert.equal(holder.refreshTokenSec, 999)
    assert.equal(holder.accessTokenSec, 100)
  })
})

// ---------------------------------------------------------------------------
// admin_impersonation setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveAdminImpersonation', () => {
  test('setting absent — returns config default false', async ({ assert }) => {
    const result = await resolveEffectiveAdminImpersonation(noTableSettings(), false)
    assert.isFalse(result.enabled)
  })

  test('setting enabled=true — overrides config default false', async ({ assert }) => {
    const svc = settings({ admin_impersonation: { enabled: true } })
    const result = await resolveEffectiveAdminImpersonation(svc, false)
    assert.isTrue(result.enabled)
  })

  test('setting enabled=false — overrides config default true', async ({ assert }) => {
    const svc = settings({ admin_impersonation: { enabled: false } })
    const result = await resolveEffectiveAdminImpersonation(svc, true)
    assert.isFalse(result.enabled)
  })

  test('invalid shape — returns config default', async ({ assert }) => {
    const svc = settings({ admin_impersonation: 'bad' })
    const result = await resolveEffectiveAdminImpersonation(svc, true)
    assert.isTrue(result.enabled)
  })
})

// ---------------------------------------------------------------------------
// organizations_policy setting
// ---------------------------------------------------------------------------

test.group('resolveEffectiveOrganizationsPolicy', () => {
  test('setting absent — returns config defaults', async ({ assert }) => {
    const result = await resolveEffectiveOrganizationsPolicy(noTableSettings(), { allowSelfCreate: true, invitationTtlHours: 48, roles: ['owner', 'member'] })
    assert.isTrue(result.allowSelfCreate)
    assert.equal(result.invitationTtlHours, 48)
    assert.deepEqual(result.roles, ['owner', 'member'])
  })

  test('setting present — overrides all fields', async ({ assert }) => {
    const svc = settings({ organizations_policy: { allowSelfCreate: true, invitationTtlHours: 24, roles: ['owner', 'editor', 'viewer'] } })
    const result = await resolveEffectiveOrganizationsPolicy(svc)
    assert.isTrue(result.allowSelfCreate)
    assert.equal(result.invitationTtlHours, 24)
    assert.deepEqual(result.roles, ['owner', 'editor', 'viewer'])
  })

  test('owner is always added to roles invariant', async ({ assert }) => {
    const svc = settings({ organizations_policy: { roles: ['admin', 'member'] } })
    const result = await resolveEffectiveOrganizationsPolicy(svc)
    assert.isTrue(result.roles.includes('owner'))
  })

  test('config default roles also get owner invariant', async ({ assert }) => {
    const result = await resolveEffectiveOrganizationsPolicy(noTableSettings(), { roles: ['admin'] })
    assert.isTrue(result.roles.includes('owner'))
  })

  test('invalid roles (non-array) — falls back to defaults', async ({ assert }) => {
    const svc = settings({ organizations_policy: { roles: 'bad' } })
    const result = await resolveEffectiveOrganizationsPolicy(svc, { roles: ['owner', 'member'] })
    assert.deepEqual(result.roles, ['owner', 'member'])
  })

  test('lib defaults (allowSelfCreate=false, ttl=168, standard roles)', async ({ assert }) => {
    const result = await resolveEffectiveOrganizationsPolicy(noTableSettings())
    assert.isFalse(result.allowSelfCreate)
    assert.equal(result.invitationTtlHours, 168)
    assert.isTrue(result.roles.includes('owner'))
  })
})

// ---------------------------------------------------------------------------
// checkLegacyPolicyConfig doctor check
// ---------------------------------------------------------------------------

test.group('checkLegacyPolicyConfig', () => {
  function makeInput(cfg: Record<string, any>): DoctorInput {
    return {
      authkitConfig: cfg,
      sessionConfig: null,
      peers: { session: true, shield: true, ally: false, limiter: true },
    }
  }

  test('no legacy fields — returns empty array', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      issuer: 'http://localhost/oidc',
      lockout: { store: 'redis' }, // only store, which is infra
    }))
    assert.deepEqual(findings, [])
  })

  test('lockout policy fields — reports each field', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      lockout: { enabled: true, maxAttempts: 5, windowSec: 900, baseLockoutSec: 60, maxLockoutSec: 3600 },
    }))
    assert.isTrue(findings.length >= 5)
    assert.isTrue(findings.every(f => f.level === 'warn'))
    assert.isTrue(findings.some(f => f.message.includes('lockout.enabled')))
    assert.isTrue(findings.some(f => f.message.includes('lockout.maxAttempts')))
  })

  test('rateLimit bucket fields — reports with limitation note', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      rateLimit: { login: { points: 10, duration: '1 min' }, introspection: { points: 60, duration: '1 min' } },
    }))
    assert.isTrue(findings.some(f => f.message.includes('rateLimit.login')))
    assert.isTrue(findings.some(f => f.message.includes('rateLimit.introspection')))
  })

  test('notifications fields', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      notifications: { newLoginEmail: true, newDeviceEmail: false },
    }))
    assert.isTrue(findings.some(f => f.message.includes('notifications.newLoginEmail')))
    assert.isTrue(findings.some(f => f.message.includes('notifications.newDeviceEmail')))
  })

  test('trustedDevices fields', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      trustedDevices: { enabled: true, days: 30 },
    }))
    assert.isTrue(findings.some(f => f.message.includes('trustedDevices.enabled')))
    assert.isTrue(findings.some(f => f.message.includes('trustedDevices.days')))
  })

  test('admin.impersonation field', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      admin: { enabled: true, roles: ['ADMIN'], impersonation: true },
    }))
    assert.isTrue(findings.some(f => f.message.includes('admin.impersonation')))
  })

  test('organizations policy fields', ({ assert }) => {
    const findings = checkLegacyPolicyConfig(makeInput({
      organizations: { enabled: true, allowSelfCreate: false, invitationTtlHours: 168, roles: ['owner', 'admin', 'member'] },
    }))
    assert.isTrue(findings.some(f => f.message.includes('organizations.allowSelfCreate')))
    assert.isTrue(findings.some(f => f.message.includes('organizations.invitationTtlHours')))
    assert.isTrue(findings.some(f => f.message.includes('organizations.roles')))
  })

  test('password policy fields via __passwordConfig', ({ assert }) => {
    const store = {
      __passwordConfig: {
        policy: { minLength: 8, requireUppercase: true },
        checkPwned: true,
      },
    }
    const findings = checkLegacyPolicyConfig(makeInput({ accountStore: store }))
    assert.isTrue(findings.some(f => f.message.includes('password.policy.minLength')))
    assert.isTrue(findings.some(f => f.message.includes('password.policy.requireUppercase')))
    assert.isTrue(findings.some(f => f.message.includes('password.checkPwned')))
  })

  test('null config — returns empty array without throwing', ({ assert }) => {
    const findings = checkLegacyPolicyConfig({ authkitConfig: null, sessionConfig: null, peers: { session: true, shield: true, ally: false, limiter: false } })
    assert.deepEqual(findings, [])
  })
})

// ---------------------------------------------------------------------------
// Settings CLI commands
// ---------------------------------------------------------------------------

test.group('settingsList', () => {
  test('table absent — warns without throwing', async ({ assert }) => {
    const app = {
      container: {
        async make(key: string) {
          if (key === 'lucid.db') return noTableDb()
          throw new Error('unexpected')
        },
      },
    }
    const messages: string[] = []
    await settingsList(app as any, { logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    assert.isTrue(messages.some(m => m.toLowerCase().includes('auth_settings')))
  })

  test('empty table — info message', async ({ assert }) => {
    const app = fakeApp({})
    const messages: string[] = []
    await settingsList(app as any, { logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    assert.isTrue(messages.some(m => m.toLowerCase().includes('empty') || m.toLowerCase().includes('no runtime')))
  })

  test('rows present — lists keys', async ({ assert }) => {
    const app = fakeApp({ lockout: { enabled: true }, session_policy: { rememberDays: 14 } })
    const messages: string[] = []
    await settingsList(app as any, { logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    assert.isTrue(messages.some(m => m.includes('lockout')))
    assert.isTrue(messages.some(m => m.includes('session_policy')))
  })

  test('--json outputs JSON array', async ({ assert }) => {
    const app = fakeApp({ lockout: { enabled: true } })
    const messages: string[] = []
    await settingsList(app as any, { json: true, logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    const json = JSON.parse(messages[0])
    assert.isTrue(Array.isArray(json))
    assert.isTrue(json.some((r: any) => r.key === 'lockout'))
  })
})

test.group('settingsGet', () => {
  test('key not found — warns', async ({ assert }) => {
    const app = fakeApp({})
    const messages: string[] = []
    await settingsGet(app as any, 'lockout', { logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    assert.isTrue(messages.some(m => m.toLowerCase().includes('not found') || m.toLowerCase().includes('not set')))
  })

  test('key found — prints value', async ({ assert }) => {
    const app = fakeApp({ lockout: { enabled: true, maxAttempts: 5 } })
    const messages: string[] = []
    await settingsGet(app as any, 'lockout', { logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    assert.isTrue(messages.some(m => m.includes('lockout')))
  })

  test('--json outputs key+value', async ({ assert }) => {
    const app = fakeApp({ token_ttl: { accessTokenSec: 1800 } })
    const messages: string[] = []
    await settingsGet(app as any, 'token_ttl', { json: true, logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m) } })
    const result = JSON.parse(messages[0])
    assert.equal(result.key, 'token_ttl')
    assert.deepEqual(result.value, { accessTokenSec: 1800 })
  })
})

test.group('settingsSet', () => {
  test('invalid JSON — returns false, logs error', async ({ assert }) => {
    const app = fakeApp({})
    const errors: string[] = []
    const ok = await settingsSet(app as any, 'lockout', 'not-json', { logger: { info: () => {}, warn: () => {}, error: (m) => errors.push(m) } })
    assert.isFalse(ok)
    assert.isTrue(errors.some(m => m.toLowerCase().includes('invalid json')))
  })

  test('known key with invalid shape — returns false', async ({ assert }) => {
    const app = fakeApp({})
    const errors: string[] = []
    const ok = await settingsSet(app as any, SETTING_KEYS.LOCKOUT, '{"enabled":"bad"}', { logger: { info: () => {}, warn: () => {}, error: (m) => errors.push(m) } })
    assert.isFalse(ok)
    assert.isTrue(errors.length > 0)
  })

  test('known key with valid shape — persists', async ({ assert }) => {
    const app = fakeApp({})
    const ok = await settingsSet(app as any, SETTING_KEYS.LOCKOUT, '{"enabled":false,"maxAttempts":3}', { logger: { info: () => {}, warn: () => {}, error: () => {} } })
    assert.isTrue(ok)
    // Verify it was persisted
    const db = (app as any).__db
    const raw = db.__store.get(SETTING_KEYS.LOCKOUT)
    assert.isDefined(raw)
    const parsed = JSON.parse(raw.value)
    assert.isFalse(parsed.enabled)
    assert.equal(parsed.maxAttempts, 3)
  })

  test('unknown key — warns but still saves', async ({ assert }) => {
    const app = fakeApp({})
    const warns: string[] = []
    const ok = await settingsSet(app as any, 'my_custom_key', '{"foo":"bar"}', { logger: { info: () => {}, warn: (m) => warns.push(m), error: () => {} } })
    assert.isTrue(ok)
    assert.isTrue(warns.some(m => m.includes('not in the known setting catalog')))
    // Still saved
    const db = (app as any).__db
    const raw = db.__store.get('my_custom_key')
    assert.isDefined(raw)
  })

  test('--json outputs result', async ({ assert }) => {
    const app = fakeApp({})
    const messages: string[] = []
    await settingsSet(app as any, SETTING_KEYS.NOTIFICATIONS, '{"newLoginEmail":false}', { json: true, logger: { info: (m) => messages.push(m), warn: () => {}, error: () => {} } })
    const result = JSON.parse(messages[0])
    assert.isTrue(result.updated)
    assert.equal(result.key, SETTING_KEYS.NOTIFICATIONS)
  })

  test('all known-key shapes pass validation', async ({ assert }) => {
    const validPayloads: Record<string, string> = {
      [SETTING_KEYS.LOCKOUT]: '{"enabled":true,"maxAttempts":5}',
      [SETTING_KEYS.RATE_LIMIT]: '{"login":{"points":10,"duration":"1 min"}}',
      [SETTING_KEYS.PASSWORD_POLICY]: '{"minLength":8,"checkPwned":false}',
      [SETTING_KEYS.NOTIFICATIONS]: '{"newLoginEmail":true,"newDeviceEmail":false}',
      [SETTING_KEYS.TRUSTED_DEVICES]: '{"enabled":true,"days":30}',
      [SETTING_KEYS.TOKEN_TTL]: '{"accessTokenSec":900}',
      [SETTING_KEYS.ADMIN_IMPERSONATION]: '{"enabled":false}',
      [SETTING_KEYS.ORGANIZATIONS_POLICY]: '{"allowSelfCreate":false,"roles":["owner","admin"]}',
    }
    const app = fakeApp({})
    for (const [key, json] of Object.entries(validPayloads)) {
      const ok = await settingsSet(app as any, key, json, { logger: { info: () => {}, warn: () => {}, error: () => {} } })
      assert.isTrue(ok, `Expected ${key} to pass validation with payload: ${json}`)
    }
  })
})

test.group('settingsUnset', () => {
  test('key not set — warns without error', async ({ assert }) => {
    const app = fakeApp({})
    const msgs: string[] = []
    await settingsUnset(app as any, 'lockout', { logger: { info: () => {}, warn: (m) => msgs.push(m), error: () => {} } })
    assert.isTrue(msgs.some(m => m.toLowerCase().includes('not set') || m.toLowerCase().includes('nothing')))
  })

  test('key exists — deletes it', async ({ assert }) => {
    const app = fakeApp({ lockout: { enabled: true } })
    const infos: string[] = []
    await settingsUnset(app as any, 'lockout', { logger: { info: (m) => infos.push(m), warn: () => {}, error: () => {} } })
    // Verify it was deleted
    const db = (app as any).__db
    assert.isUndefined(db.__store.get('lockout'))
    assert.isTrue(infos.some(m => m.includes('lockout')))
  })

  test('--json outputs deleted: true', async ({ assert }) => {
    const app = fakeApp({ trusted_devices: { enabled: false } })
    const messages: string[] = []
    await settingsUnset(app as any, 'trusted_devices', { json: true, logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m), error: () => {} } })
    // Look for JSON output
    const jsonLine = messages.find(m => { try { JSON.parse(m); return true } catch { return false } })
    assert.isDefined(jsonLine)
    const result = JSON.parse(jsonLine!)
    assert.isTrue(result.deleted)
  })

  test('--json and key not found outputs deleted: false', async ({ assert }) => {
    const app = fakeApp({})
    const messages: string[] = []
    await settingsUnset(app as any, 'nonexistent', { json: true, logger: { info: (m) => messages.push(m), warn: (m) => messages.push(m), error: () => {} } })
    const jsonLine = messages.find(m => { try { JSON.parse(m); return true } catch { return false } })
    assert.isDefined(jsonLine)
    const result = JSON.parse(jsonLine!)
    assert.isFalse(result.deleted)
  })
})
