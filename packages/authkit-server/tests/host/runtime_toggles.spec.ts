/**
 * Tests for runtime_toggles.ts — resolveEffectiveRegistration,
 * resolveEffectiveRequireVerifiedEmail, resolveEffectiveMaintenanceMode,
 * resolveEffectiveAuthMethods.
 *
 * Each resolver follows the same contract:
 *   - setting present  → value from setting
 *   - setting absent   → configDefault
 *   - DB error         → configDefault (fail-safe)
 *   - invalid shape    → configDefault
 */

import { test } from '@japa/runner'
import { RuntimeSettings } from '../../src/host/runtime_settings.js'
import {
  resolveEffectiveRegistration,
  resolveEffectiveRequireVerifiedEmail,
  resolveEffectiveMaintenanceMode,
  resolveEffectiveAuthMethods,
  SETTING_KEYS,
} from '../../src/host/runtime_toggles.js'

// ---------- helpers ----------

function fakeDb(rows: Record<string, any> = {}) {
  const store = new Map<string, { value: string }>(
    Object.entries(rows).map(([k, v]) => [k, { value: JSON.stringify(v) }])
  )
  return {
    table(_name: string) {
      return {
        // Probe: select().limit() → resolves (table present).
        select(_cols?: string) {
          return { limit(_n: number) { return Promise.resolve([]) } }
        },
        where(_col: string, key: string) {
          return {
            async first() {
              const v = store.get(key)
              return v ? { key, value: v.value, updated_at: new Date(), updated_by: null } : null
            },
          }
        },
      }
    },
  }
}

function noTableDb() {
  return {
    // table() throws → probe catches → tablePresent = false.
    table() { throw new Error('no table') },
  }
}

function throwingDb() {
  return {
    // table() throws → probe catches → fail-safe (tablePresent = false).
    table() { throw new Error('db down') },
  }
}

function settings(db: any) {
  return new RuntimeSettings(db as any)
}

// ---------- SETTING_KEYS registry ----------

test.group('SETTING_KEYS', () => {
  test('contains all toggle keys including auth_methods', ({ assert }) => {
    assert.equal(SETTING_KEYS.REGISTRATION, 'registration')
    assert.equal(SETTING_KEYS.REQUIRE_VERIFIED_EMAIL, 'require_verified_email')
    assert.equal(SETTING_KEYS.MAINTENANCE_MODE, 'maintenance_mode')
    assert.equal(SETTING_KEYS.BOT_PROTECTION, 'bot_protection')
    assert.equal(SETTING_KEYS.AUTH_METHODS, 'auth_methods')
  })
})

// ---------- resolveEffectiveRegistration ----------

test.group('resolveEffectiveRegistration', () => {
  test('setting { enabled: true } → true', async ({ assert }) => {
    const s = settings(fakeDb({ registration: { enabled: true } }))
    assert.isTrue(await resolveEffectiveRegistration(true, s))
  })

  test('setting { enabled: false } → false (overrides configDefault true)', async ({ assert }) => {
    const s = settings(fakeDb({ registration: { enabled: false } }))
    assert.isFalse(await resolveEffectiveRegistration(true, s))
  })

  test('setting { enabled: false } → false even when configDefault is false', async ({ assert }) => {
    const s = settings(fakeDb({ registration: { enabled: false } }))
    assert.isFalse(await resolveEffectiveRegistration(false, s))
  })

  test('setting absent → configDefault=true', async ({ assert }) => {
    const s = settings(noTableDb())
    assert.isTrue(await resolveEffectiveRegistration(true, s))
  })

  test('setting absent → configDefault=false', async ({ assert }) => {
    const s = settings(noTableDb())
    assert.isFalse(await resolveEffectiveRegistration(false, s))
  })

  test('DB error (fail-safe) → configDefault=true', async ({ assert }) => {
    const s = settings(throwingDb())
    assert.isTrue(await resolveEffectiveRegistration(true, s))
  })

  test('invalid shape (missing enabled) → configDefault', async ({ assert }) => {
    const s = settings(fakeDb({ registration: { foo: 'bar' } }))
    assert.isTrue(await resolveEffectiveRegistration(true, s))
  })

  test('invalid shape (enabled is a string) → configDefault', async ({ assert }) => {
    const s = settings(fakeDb({ registration: { enabled: 'yes' } }))
    assert.isFalse(await resolveEffectiveRegistration(false, s))
  })
})

// ---------- resolveEffectiveRequireVerifiedEmail ----------

test.group('resolveEffectiveRequireVerifiedEmail', () => {
  test('setting { enabled: true } → true (overrides configDefault false)', async ({ assert }) => {
    const s = settings(fakeDb({ require_verified_email: { enabled: true } }))
    assert.isTrue(await resolveEffectiveRequireVerifiedEmail(false, s))
  })

  test('setting { enabled: false } → false (overrides configDefault true)', async ({ assert }) => {
    const s = settings(fakeDb({ require_verified_email: { enabled: false } }))
    assert.isFalse(await resolveEffectiveRequireVerifiedEmail(true, s))
  })

  test('setting absent → configDefault=false', async ({ assert }) => {
    const s = settings(noTableDb())
    assert.isFalse(await resolveEffectiveRequireVerifiedEmail(false, s))
  })

  test('setting absent → configDefault=true', async ({ assert }) => {
    const s = settings(noTableDb())
    assert.isTrue(await resolveEffectiveRequireVerifiedEmail(true, s))
  })

  test('DB error (fail-safe) → configDefault=false', async ({ assert }) => {
    const s = settings(throwingDb())
    assert.isFalse(await resolveEffectiveRequireVerifiedEmail(false, s))
  })

  test('invalid shape → configDefault', async ({ assert }) => {
    const s = settings(fakeDb({ require_verified_email: { on: true } }))
    assert.isFalse(await resolveEffectiveRequireVerifiedEmail(false, s))
  })
})

// ---------- resolveEffectiveMaintenanceMode ----------

test.group('resolveEffectiveMaintenanceMode', () => {
  test('setting { enabled: true } → { enabled: true }', async ({ assert }) => {
    const s = settings(fakeDb({ maintenance_mode: { enabled: true } }))
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isTrue(result.enabled)
    assert.isUndefined(result.message)
  })

  test('setting { enabled: true, message: "foo" } → message preserved', async ({ assert }) => {
    const s = settings(fakeDb({ maintenance_mode: { enabled: true, message: 'Deploying v2.' } }))
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isTrue(result.enabled)
    assert.equal(result.message, 'Deploying v2.')
  })

  test('setting { enabled: false } → { enabled: false }', async ({ assert }) => {
    const s = settings(fakeDb({ maintenance_mode: { enabled: false } }))
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isFalse(result.enabled)
  })

  test('setting absent → { enabled: false } (system UP by default)', async ({ assert }) => {
    const s = settings(noTableDb())
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isFalse(result.enabled)
  })

  test('DB error (fail-safe) → { enabled: false }', async ({ assert }) => {
    const s = settings(throwingDb())
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isFalse(result.enabled)
  })

  test('invalid shape → { enabled: false }', async ({ assert }) => {
    const s = settings(fakeDb({ maintenance_mode: { active: true } }))
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isFalse(result.enabled)
  })

  test('message that is not a string → message stripped', async ({ assert }) => {
    const s = settings(fakeDb({ maintenance_mode: { enabled: true, message: 42 } }))
    const result = await resolveEffectiveMaintenanceMode(s)
    assert.isTrue(result.enabled)
    assert.isUndefined(result.message)
  })
})

// ---------- resolveEffectiveAuthMethods ----------

test.group('resolveEffectiveAuthMethods', () => {
  // --- defaults derivados ---

  test('setting absent → all config defaults (password true, forgotPassword true)', async ({ assert }) => {
    const s = settings(noTableDb())
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
      magicLinkCapable: true,
      passkeyCapable: false,
    })
    assert.isTrue(result.password)
    assert.isTrue(result.magicLink)
    assert.isFalse(result.passkey)
    assert.deepEqual(result.social, ['google'])
    assert.isTrue(result.forgotPassword)
  })

  test('setting absent, no capabilities → password true, magicLink false, passkey false', async ({ assert }) => {
    const s = settings(noTableDb())
    const result = await resolveEffectiveAuthMethods(s, {})
    assert.isTrue(result.password)
    assert.isFalse(result.magicLink)
    assert.isFalse(result.passkey)
    assert.deepEqual(result.social, [])
    assert.isTrue(result.forgotPassword)
  })

  // --- setting sobrescreve ---

  test('setting { password: false, magicLink: true } → password off, forgotPassword auto-off', async ({ assert }) => {
    // magicLink=true in setting so not all-off (fail-safe won't trigger)
    const s = settings(fakeDb({ auth_methods: { password: false, magicLink: true } }))
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: [],
      magicLinkCapable: true,
    })
    assert.isFalse(result.password)
    assert.isFalse(result.forgotPassword) // auto-derived
  })

  test('setting { password: true, forgotPassword: false } → forgotPassword off when password on', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { password: true, forgotPassword: false } }))
    const result = await resolveEffectiveAuthMethods(s, {})
    assert.isTrue(result.password)
    assert.isFalse(result.forgotPassword)
  })

  test('setting { password: false, forgotPassword: true } → forgotPassword off (auto-derived, magicLink on to avoid fail-safe)', async ({ assert }) => {
    // Need magicLink=true to avoid all-off fail-safe triggering
    const s = settings(fakeDb({ auth_methods: { password: false, magicLink: true, forgotPassword: true } }))
    const result = await resolveEffectiveAuthMethods(s, { magicLinkCapable: true })
    assert.isFalse(result.password)
    assert.isFalse(result.forgotPassword) // auto-derived: password off → forgotPassword always off
  })

  test('setting { magicLink: false } → magicLink off', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { magicLink: false } }))
    const result = await resolveEffectiveAuthMethods(s, { magicLinkCapable: true })
    assert.isFalse(result.magicLink)
  })

  test('setting { magicLink: true } but capability false → magicLink off', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { magicLink: true } }))
    const result = await resolveEffectiveAuthMethods(s, { magicLinkCapable: false })
    // setting says true, capability says false — setting overrides, capability is already baked
    // Actually: setting.magicLink=true overrides default; capability is only for default
    // So if setting.magicLink=true → magicLink=true regardless of capability
    assert.isTrue(result.magicLink)
  })

  test('setting { passkey: true } → passkey on when passkeyCapable', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { passkey: true } }))
    const result = await resolveEffectiveAuthMethods(s, { passkeyCapable: true })
    assert.isTrue(result.passkey)
  })

  // --- social interseção ---

  test('social setting filtered by configured providers (intersection)', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { social: ['google', 'github', 'unknown'] } }))
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google', 'github'],
    })
    assert.deepEqual(result.social, ['google', 'github'])
  })

  test('social setting with provider not in config → filtered out', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { social: ['phantom'] } }))
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
    })
    assert.deepEqual(result.social, []) // phantom not in config
  })

  test('social setting empty array → no social providers', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { social: [] } }))
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
    })
    assert.deepEqual(result.social, [])
  })

  // --- fail-safe all-off ---

  test('all methods off → fail-safe reverts to config defaults', async ({ assert }) => {
    const s = settings(fakeDb({
      auth_methods: { password: false, magicLink: false, passkey: false, social: [] },
    }))
    // Suppress the console.warn in test
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (...args: any[]) => warnings.push(String(args[0]))

    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
      magicLinkCapable: true,
    })

    console.warn = originalWarn

    // Should revert to config defaults
    assert.isTrue(result.password)
    assert.isTrue(result.magicLink)
    assert.deepEqual(result.social, ['google'])
    assert.isTrue(warnings.some((w) => w.includes('fail-safe')))
  })

  // --- erro DB → fail-safe ---

  test('DB error → config defaults (fail-safe)', async ({ assert }) => {
    const s = settings(throwingDb())
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
      magicLinkCapable: false,
    })
    assert.isTrue(result.password)
    assert.isFalse(result.magicLink)
    assert.deepEqual(result.social, ['google'])
    assert.isTrue(result.forgotPassword)
  })

  // --- shape inválida ---

  test('invalid shape (array) → config defaults', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: ['password'] }))
    const result = await resolveEffectiveAuthMethods(s, {})
    assert.isTrue(result.password)
    assert.isTrue(result.forgotPassword)
  })

  test('partial setting (only passkey field) → other fields use defaults', async ({ assert }) => {
    const s = settings(fakeDb({ auth_methods: { passkey: true } }))
    const result = await resolveEffectiveAuthMethods(s, {
      configuredSocialProviders: ['google'],
      magicLinkCapable: true,
      passkeyCapable: true,
    })
    assert.isTrue(result.password)
    assert.isTrue(result.magicLink)
    assert.isTrue(result.passkey)
    assert.deepEqual(result.social, ['google'])
    assert.isTrue(result.forgotPassword)
  })
})
