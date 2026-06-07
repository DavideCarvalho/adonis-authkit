import { test } from '@japa/runner'
import ApiSettingsController from '../src/host/admin_api/api_settings_controller.js'
import { RuntimeSettings } from '../src/host/runtime_settings.js'

// ---------- in-memory settings DB for tests ----------

function makeSettingsDb(initialRows: Record<string, any> = {}) {
  const storeKey = (key: string, orgId: string | null) => `${key}|${orgId ?? ''}`
  const store = new Map<string, { key: string; org_id: string | null; value: string; updated_at: Date; updated_by: string | null }>(
    Object.entries(initialRows).map(([k, v]) => [storeKey(k, null), { key: k, org_id: null, value: JSON.stringify(v), updated_at: new Date(), updated_by: null }])
  )
  let _hasTable = true

  function makeChain(filters: Array<{ col: string; val: string | null; isNull: boolean }>) {
    return {
      where(col: string, val: string) {
        return makeChain([...filters, { col, val, isNull: false }])
      },
      whereNull(col: string) {
        return makeChain([...filters, { col, val: null, isNull: true }])
      },
      async first() {
        const keyFilter = filters.find(f => f.col === 'key')
        const orgFilter = filters.find(f => f.col === 'organization_id')
        if (!keyFilter) return null
        const keyVal = keyFilter.val!
        const orgId: string | null = orgFilter ? (orgFilter.isNull ? null : orgFilter.val) : null
        const sk = storeKey(keyVal, orgId)
        const v = store.get(sk)
        if (!v) return null
        return { key: v.key, organization_id: v.org_id, ...v }
      },
      async delete() {
        const keyFilter = filters.find(f => f.col === 'key')
        const orgFilter = filters.find(f => f.col === 'organization_id')
        if (!keyFilter) return
        const orgId: string | null = orgFilter ? (orgFilter.isNull ? null : orgFilter.val) : null
        store.delete(storeKey(keyFilter.val!, orgId))
      },
    }
  }

  const db = {
    _store: store,
    withNoTable() { _hasTable = false; return db },
    from(name: string) { return this.table(name) },
    table(name: string) {
      if (name !== 'auth_settings') throw new Error(`unexpected table: ${name}`)
      // Probe: select().limit() — se _hasTable for false, lança para simular tabela ausente.
      if (!_hasTable) throw new Error('table does not exist')
      const allRows = () => [...store.values()].map(v => ({ key: v.key, organization_id: v.org_id, value: v.value, updated_at: v.updated_at, updated_by: v.updated_by }))
      return {
        where(col: string, val: string) {
          return makeChain([{ col, val, isNull: false }])
        },
        whereNull(col: string) {
          return makeChain([{ col, val: null, isNull: true }])
        },
        async insert(row: any) {
          const orgId: string | null = row.organization_id ?? null
          const sk = storeKey(row.key, orgId)
          store.set(sk, { key: row.key, org_id: orgId, value: row.value, updated_at: row.updated_at ?? new Date(), updated_by: row.updated_by ?? null })
        },
        // select() retorna chainable com .limit() para o probe funcionar e .whereNull()/.where() para listSettings.
        select(_cols?: string) {
          const rows = allRows()
          return {
            where(col: string, val: string) {
              const filtered = rows.filter(r => (r as any)[col] === val)
              return {
                limit(_n: number) { return Promise.resolve(filtered.slice(0, _n)) },
                then(resolve: any, reject: any) { return Promise.resolve(filtered).then(resolve, reject) },
              }
            },
            whereNull(col: string) {
              const filtered = rows.filter(r => (r as any)[col] === null || (r as any)[col] === undefined)
              return {
                limit(_n: number) { return Promise.resolve(filtered.slice(0, _n)) },
                then(resolve: any, reject: any) { return Promise.resolve(filtered).then(resolve, reject) },
              }
            },
            limit(_n: number) { return Promise.resolve(rows.slice(0, _n)) },
            then(resolve: any, reject: any) { return Promise.resolve(rows).then(resolve, reject) },
          }
        },
      }
    },
  }
  return db
}

/** Fake flash/session for tests */
function fakeSession(initial: Record<string, any> = {}) {
  const data = new Map(Object.entries(initial))
  const flashed: Record<string, any> = {}
  return {
    get: (k: string) => data.get(k),
    put: (k: string, v: any) => data.set(k, v),
    flash: (k: string, v: any) => { flashed[k] = v },
    flashMessages: {
      get: (k: string) => flashed[k] ?? null,
    },
    _flashed: flashed,
  }
}

function fakeCtx(opts: { service: any; db: any; inputs?: Record<string, any>; session?: any }) {
  const { service, db, inputs = {}, session = fakeSession() } = opts
  const captured = { _redirected: null as string | null }
  const ctx = {
    session,
    request: {
      csrfToken: 'csrf',
      input: (k: string) => inputs[k],
      ip: () => '127.0.0.1',
    },
    response: {
      redirect(url: string) { captured._redirected = url; return undefined },
    },
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') return service
        if (key === 'lucid.db') return db
        throw new Error(`unknown key: ${key}`)
      },
    },
  }
  return { ctx, captured, session }
}

function fakeApiCtx(opts: { service: any; db: any; params?: Record<string, string>; body?: Record<string, any>; query?: Record<string, string> }) {
  const { service, db, params = {}, body = {}, query = {} } = opts
  const captured = { _status: 200 }
  const ctx = {
    request: {
      param: (k: string) => params[k],
      body: () => body,
      ip: () => '127.0.0.1',
      qs: () => query,
    },
    response: {
      notFound: (data: any) => { captured._status = 404; return data },
      badRequest: (data: any) => { captured._status = 400; return data },
    },
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') return service
        if (key === 'lucid.db') return db
        throw new Error(`unknown key: ${key}`)
      },
    },
  }
  return { ctx, captured }
}

function buildService(withBotProtection = true, opts: { social?: string[]; magicLink?: boolean; passkeyCapable?: boolean } = {}) {
  const messages: Record<string, string> = {
    'admin.settings.saved': 'Settings saved.',
    'admin.settings.no_settings_table': 'No settings table.',
    'admin.settings.reset_done': 'Reset done.',
  }
  const config = {
    botProtection: withBotProtection ? { verify: async () => true, on: ['login', 'signup'] } : undefined,
    render: async (_ctx: any, view: string, data: any) => ({ view, data }),
    messages,
    audit: {
      events: [] as any[],
      record: async (e: any) => { config.audit.events.push(e) },
    },
    social: opts.social ? { providers: opts.social } : undefined,
    passwordless: { magicLink: opts.magicLink ?? false, passkeyFirst: false },
    webauthn: opts.passkeyCapable ? { rpId: 'localhost' } : undefined,
    accountStore: {
      findById: () => {},
      issueMagicLinkToken: opts.magicLink ? async () => null : undefined,
    },
  }
  return { config }
}

// ---------- tests ----------

test.group('Admin REST API — /settings', (group) => {
  let settingsDb: ReturnType<typeof makeSettingsDb>
  let service: any

  group.setup(() => {
    service = buildService(false)
    settingsDb = makeSettingsDb()
  })

  test('GET /settings: empty list when no rows', async ({ assert }) => {
    const ctrl = new ApiSettingsController()
    const { ctx } = fakeApiCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isArray(result.data)
    assert.lengthOf(result.data, 0)
  })

  test('GET /settings: 404 capability_unsupported when no table', async ({ assert }) => {
    const noTableDb = makeSettingsDb().withNoTable()
    const ctrl = new ApiSettingsController()
    const { ctx, captured } = fakeApiCtx({ service, db: noTableDb })
    const result: any = await ctrl.index(ctx as any)
    assert.equal(captured._status, 404)
    assert.equal(result.error.code, 'capability_unsupported')
  })

  test('PUT /settings/:key creates a setting', async ({ assert }) => {
    const ctrl = new ApiSettingsController()
    const value = { enabled: true, on: ['login'] }
    const { ctx } = fakeApiCtx({ service, db: settingsDb, params: { key: 'bot_protection' }, body: { value } })
    const result: any = await ctrl.upsert(ctx as any)
    assert.equal(result.key, 'bot_protection')
    assert.deepEqual(result.value, value)
  })

  test('PUT /settings/:key without body.value → 400', async ({ assert }) => {
    const ctrl = new ApiSettingsController()
    const { ctx, captured } = fakeApiCtx({ service, db: settingsDb, params: { key: 'x' }, body: {} })
    const result: any = await ctrl.upsert(ctx as any)
    assert.equal(captured._status, 400)
    assert.equal(result.error.code, 'invalid_request')
  })

  test('GET /settings/:key returns saved value', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'test_key', value: '"hello"', updated_at: new Date(), updated_by: null })
    const ctrl = new ApiSettingsController()
    const { ctx } = fakeApiCtx({ service, db: settingsDb, params: { key: 'test_key' } })
    const result: any = await ctrl.show(ctx as any)
    assert.equal(result.key, 'test_key')
    assert.equal(result.value, 'hello')
  })

  test('GET /settings/:key non-existent → 404', async ({ assert }) => {
    const ctrl = new ApiSettingsController()
    const { ctx, captured } = fakeApiCtx({ service, db: settingsDb, params: { key: 'does_not_exist_xyz' } })
    const result: any = await ctrl.show(ctx as any)
    assert.equal(captured._status, 404)
  })

  test('DELETE /settings/:key removes setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'to_delete', value: '"x"', updated_at: new Date(), updated_by: null })
    const ctrl = new ApiSettingsController()
    const { ctx } = fakeApiCtx({ service, db: settingsDb, params: { key: 'to_delete' } })
    const result: any = await ctrl.destroy(ctx as any)
    assert.isTrue(result.deleted)
    const settings = new RuntimeSettings(settingsDb as any)
    const after = await settings.getSetting('to_delete')
    assert.isNull(after)
  })

  test('PUT upsert audits settings.updated event', async ({ assert }) => {
    const ctrl = new ApiSettingsController()
    const { ctx } = fakeApiCtx({ service, db: settingsDb, params: { key: 'audit_test' }, body: { value: { enabled: false } } })
    await ctrl.upsert(ctx as any)
    const ev = service.config.audit.events.find((e: any) => e.type === 'settings.updated' && e.metadata?.key === 'audit_test')
    assert.isNotNull(ev)
  })
})
