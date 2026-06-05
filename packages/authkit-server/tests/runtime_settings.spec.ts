import { test } from '@japa/runner'
import { RuntimeSettings, supportsSettings } from '../src/host/runtime_settings.js'

// ---------- helpers ----------

/** Minimal DB-like object simulating auth_settings table present. */
function fakeDb(rows: Record<string, string> = {}) {
  const store = new Map<string, { value: string; updatedAt: Date; updatedBy: string | null }>(
    Object.entries(rows).map(([k, v]) => [k, { value: v, updatedAt: new Date(), updatedBy: null }])
  )
  return {
    _hasTable: true,
    async connection() {
      return {
        schema: {
          async hasTable(name: string) { return name === 'auth_settings' },
        },
      }
    },
    table(_name: string) {
      return {
        where(_col: string, key: string) {
          return {
            async first() {
              const v = store.get(key)
              return v ? { key, value: v.value, updated_at: v.updatedAt, updated_by: v.updatedBy } : null
            },
            async delete() { store.delete(key) },
          }
        },
        async select(_cols?: string) {
          return [...store.entries()].map(([key, v]) => ({ key, value: v.value, updated_at: v.updatedAt, updated_by: v.updatedBy }))
        },
        async insert(row: any) {
          store.set(row.key, { value: row.value, updatedAt: row.updated_at ?? new Date(), updatedBy: row.updated_by ?? null })
        },
      }
    },
    __store: store,
  }
}

function noTableDb() {
  return {
    async connection() {
      return { schema: { async hasTable() { return false } } }
    },
    table() { throw new Error('should not be called') },
  }
}

function throwingDb() {
  return {
    async connection() {
      return { schema: { async hasTable() { throw new Error('db is down') } } }
    },
    table() { throw new Error('db is down') },
  }
}

// ---------- tests ----------

test.group('RuntimeSettings', () => {
  test('supportsSettings: true when getSetting present', ({ assert }) => {
    const obj = { getSetting: async () => null, setSetting: async () => {}, deleteSetting: async () => {}, listSettings: async () => [] }
    assert.isTrue(supportsSettings(obj))
  })

  test('supportsSettings: false when getSetting absent', ({ assert }) => {
    assert.isFalse(supportsSettings({}))
    assert.isFalse(supportsSettings({ setSetting: async () => {} }))
  })

  test('getSetting returns null when table absent (capability probe)', async ({ assert }) => {
    const settings = new RuntimeSettings(noTableDb() as any)
    const value = await settings.getSetting('bot_protection')
    assert.isNull(value)
  })

  test('getSetting returns null when DB throws during probe (fail-safe)', async ({ assert }) => {
    const settings = new RuntimeSettings(throwingDb() as any)
    const value = await settings.getSetting('bot_protection')
    assert.isNull(value)
  })

  test('getSetting returns parsed JSON value when row exists', async ({ assert }) => {
    const db = fakeDb({ bot_protection: JSON.stringify({ enabled: true, on: ['login'] }) })
    const settings = new RuntimeSettings(db as any)
    const value = await settings.getSetting('bot_protection')
    assert.deepEqual(value, { enabled: true, on: ['login'] })
  })

  test('getSetting returns null when key does not exist', async ({ assert }) => {
    const db = fakeDb({})
    const settings = new RuntimeSettings(db as any)
    const value = await settings.getSetting('nonexistent')
    assert.isNull(value)
  })

  test('cache: second call within TTL does not re-query DB', async ({ assert }) => {
    let queryCalls = 0
    const db = {
      async connection() { return { schema: { async hasTable() { return true } } } },
      table() {
        return {
          where(_col: string, _key: string) {
            return {
              async first() {
                queryCalls++
                return { key: 'bot_protection', value: JSON.stringify({ enabled: false }), updated_at: new Date(), updated_by: null }
              },
            }
          },
        }
      },
    }
    const settings = new RuntimeSettings(db as any, { ttlMs: 5000 })
    await settings.getSetting('bot_protection')
    await settings.getSetting('bot_protection')
    assert.equal(queryCalls, 1, 'DB should be queried only once within TTL')
  })

  test('cache: invalidate() clears cache, next call re-queries', async ({ assert }) => {
    let queryCalls = 0
    const db = {
      async connection() { return { schema: { async hasTable() { return true } } } },
      table() {
        return {
          where(_col: string, _key: string) {
            return {
              async first() {
                queryCalls++
                return { key: 'bot_protection', value: JSON.stringify({ enabled: false }), updated_at: new Date(), updated_by: null }
              },
            }
          },
        }
      },
    }
    const settings = new RuntimeSettings(db as any, { ttlMs: 60000 })
    await settings.getSetting('bot_protection')
    settings.invalidate()
    await settings.getSetting('bot_protection')
    assert.equal(queryCalls, 2, 'DB should be queried again after invalidate()')
  })

  test('listSettings returns empty array when table absent', async ({ assert }) => {
    const settings = new RuntimeSettings(noTableDb() as any)
    const list = await settings.listSettings()
    assert.deepEqual(list, [])
  })

  test('listSettings returns all rows', async ({ assert }) => {
    const db = fakeDb({ key1: '"val1"', key2: '"val2"' })
    const settings = new RuntimeSettings(db as any)
    const list = await settings.listSettings()
    assert.lengthOf(list, 2)
    assert.isTrue(list.some((r) => r.key === 'key1'))
    assert.isTrue(list.some((r) => r.key === 'key2'))
  })
})

// ---- resolveEffectiveBotProtection tests (added in Task 2) ----

import { resolveEffectiveBotProtection } from '../src/host/bot_protection.js'
import type { ResolvedBotProtectionConfig } from '../src/host/bot_protection.js'

test.group('resolveEffectiveBotProtection', () => {
  const verifyFn = async () => true
  const configBot: ResolvedBotProtectionConfig = {
    verify: verifyFn,
    on: ['login', 'signup'],
    tokenFields: ['cf-turnstile-response'],
    timeoutMs: 5000,
  }

  test('no config → undefined regardless of setting', async ({ assert }) => {
    const settings = new RuntimeSettings(noTableDb() as any)
    const result = await resolveEffectiveBotProtection(undefined, settings)
    assert.isUndefined(result)
  })

  test('no setting (table absent) → returns config as-is', async ({ assert }) => {
    const settings = new RuntimeSettings(noTableDb() as any)
    const result = await resolveEffectiveBotProtection(configBot, settings)
    assert.deepEqual(result, configBot)
  })

  test('setting { enabled: false } → returns undefined (protection off)', async ({ assert }) => {
    const db = fakeDb({ bot_protection: JSON.stringify({ enabled: false }) })
    const settings = new RuntimeSettings(db as any)
    const result = await resolveEffectiveBotProtection(configBot, settings)
    assert.isUndefined(result)
  })

  test('setting { enabled: true } with no "on" → uses config.on', async ({ assert }) => {
    const db = fakeDb({ bot_protection: JSON.stringify({ enabled: true }) })
    const settings = new RuntimeSettings(db as any)
    const result = await resolveEffectiveBotProtection(configBot, settings)
    assert.deepEqual(result!.on, configBot.on)
    assert.strictEqual(result!.verify, verifyFn)
  })

  test('setting { enabled: true, on: ["reset"] } → overrides config.on', async ({ assert }) => {
    const db = fakeDb({ bot_protection: JSON.stringify({ enabled: true, on: ['reset'] }) })
    const settings = new RuntimeSettings(db as any)
    const result = await resolveEffectiveBotProtection(configBot, settings)
    assert.deepEqual(result!.on, ['reset'])
    assert.strictEqual(result!.verify, verifyFn)
  })

  test('setting with DB error (fail-safe) → returns config as-is', async ({ assert }) => {
    const settings = new RuntimeSettings(throwingDb() as any)
    const result = await resolveEffectiveBotProtection(configBot, settings)
    assert.deepEqual(result, configBot)
  })
})
