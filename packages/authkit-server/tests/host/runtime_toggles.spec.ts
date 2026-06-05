/**
 * Tests for runtime_toggles.ts — resolveEffectiveRegistration,
 * resolveEffectiveRequireVerifiedEmail, resolveEffectiveMaintenanceMode.
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
  SETTING_KEYS,
} from '../../src/host/runtime_toggles.js'

// ---------- helpers ----------

function fakeDb(rows: Record<string, any> = {}) {
  const store = new Map<string, { value: string }>(
    Object.entries(rows).map(([k, v]) => [k, { value: JSON.stringify(v) }])
  )
  return {
    async connection() {
      return { schema: { async hasTable() { return true } } }
    },
    table(_name: string) {
      return {
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
    async connection() { return { schema: { async hasTable() { return false } } } },
    table() { throw new Error('no table') },
  }
}

function throwingDb() {
  return {
    async connection() { return { schema: { async hasTable() { throw new Error('db down') } } } },
    table() { throw new Error('db down') },
  }
}

function settings(db: any) {
  return new RuntimeSettings(db as any)
}

// ---------- SETTING_KEYS registry ----------

test.group('SETTING_KEYS', () => {
  test('contains all three toggle keys', ({ assert }) => {
    assert.equal(SETTING_KEYS.REGISTRATION, 'registration')
    assert.equal(SETTING_KEYS.REQUIRE_VERIFIED_EMAIL, 'require_verified_email')
    assert.equal(SETTING_KEYS.MAINTENANCE_MODE, 'maintenance_mode')
    assert.equal(SETTING_KEYS.BOT_PROTECTION, 'bot_protection')
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
