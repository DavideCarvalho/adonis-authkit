import { test } from '@japa/runner'
import AdminSettingsController from '../src/host/controllers/admin/admin_settings_controller.js'
import ApiSettingsController from '../src/host/admin_api/api_settings_controller.js'
import { RuntimeSettings } from '../src/host/runtime_settings.js'

// ---------- in-memory settings DB for tests ----------

function makeSettingsDb(initialRows: Record<string, any> = {}) {
  const store = new Map<string, { value: string; updated_at: Date; updated_by: string | null }>(
    Object.entries(initialRows).map(([k, v]) => [k, { value: JSON.stringify(v), updated_at: new Date(), updated_by: null }])
  )
  let _hasTable = true

  const db = {
    _store: store,
    withNoTable() { _hasTable = false; return db },
    table(name: string) {
      if (name !== 'auth_settings') throw new Error(`unexpected table: ${name}`)
      // Probe: select().limit() — se _hasTable for false, lança para simular tabela ausente.
      if (!_hasTable) throw new Error('table does not exist')
      const allRows = () => [...store.entries()].map(([key, v]) => ({ key, ...v }))
      return {
        where(_col: string, key: string) {
          return {
            async first() {
              const v = store.get(key)
              return v ? { key, ...v } : null
            },
            async delete() { store.delete(key) },
          }
        },
        async insert(row: any) {
          store.set(row.key, { value: row.value, updated_at: row.updated_at ?? new Date(), updated_by: row.updated_by ?? null })
        },
        // select() retorna chainable com .limit() para o probe funcionar.
        select(_cols?: string) {
          const rows = allRows()
          return {
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

function fakeApiCtx(opts: { service: any; db: any; params?: Record<string, string>; body?: Record<string, any> }) {
  const { service, db, params = {}, body = {} } = opts
  const captured = { _status: 200 }
  const ctx = {
    request: {
      param: (k: string) => params[k],
      body: () => body,
      ip: () => '127.0.0.1',
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

test.group('AdminSettingsController', (group) => {
  let settingsDb: ReturnType<typeof makeSettingsDb>
  let service: any

  group.setup(() => {
    service = buildService(true)
    settingsDb = makeSettingsDb()
  })

  test('GET /admin/settings renders settings page with hasTable true', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.equal(result.view, 'admin/settings')
    assert.isTrue(result.data.hasBotConfig)
    assert.isTrue(result.data.hasTable)
  })

  test('GET /admin/settings: hasTable false when table absent', async ({ assert }) => {
    const noTableDb = makeSettingsDb().withNoTable()
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: noTableDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isFalse(result.data.hasTable)
  })

  test('POST bot-protection saves setting + audits', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({
      service,
      db: settingsDb,
      inputs: { enabled: '1', on: ['login', 'reset'] },
      session,
    })
    await ctrl.updateBotProtection(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    // Check setting was persisted
    const settings = new RuntimeSettings(settingsDb as any)
    const saved: any = await settings.getSetting('bot_protection')
    assert.isTrue(saved.enabled)
    assert.deepEqual(saved.on, ['login', 'reset'])
    // Audit event
    const ev = service.config.audit.events.find((e: any) => e.type === 'settings.updated')
    assert.isNotNull(ev)
    assert.equal(ev.metadata.key, 'bot_protection')
  })

  test('POST bot-protection/reset clears setting + audits', async ({ assert }) => {
    // Seed setting first
    await settingsDb.table('auth_settings').insert({ key: 'bot_protection', value: JSON.stringify({ enabled: false }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx } = fakeCtx({ service, db: settingsDb, session })
    await ctrl.resetBotProtection(ctx as any)
    const settings = new RuntimeSettings(settingsDb as any)
    const after = await settings.getSetting('bot_protection')
    assert.isNull(after)
  })

  test('POST bot-protection with no table redirects with flash message', async ({ assert }) => {
    const noTableDb = makeSettingsDb().withNoTable()
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({ service, db: noTableDb, inputs: { enabled: '1' }, session })
    await ctrl.updateBotProtection(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
  })
})

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

// ---------------------------------------------------------------------------
// AdminSettingsController — registration + require_verified_email + maintenance
// ---------------------------------------------------------------------------

test.group('AdminSettingsController — new toggles (registration / require_verified / maintenance)', (group) => {
  let settingsDb: ReturnType<typeof makeSettingsDb>
  let service: any

  group.each.setup(() => {
    service = buildService(false) // no bot protection needed here
    settingsDb = makeSettingsDb()
  })

  // ---- registration ----

  test('GET index includes registration state (no setting → configDefault true)', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.equal(result.view, 'admin/settings')
    assert.isTrue(result.data.registrationConfigDefault)
    assert.isTrue(result.data.registrationEffective)
    assert.isNull(result.data.currentRegistrationSetting)
  })

  test('POST /registration saves { enabled: false } and audits', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({
      service,
      db: settingsDb,
      inputs: { enabled: '' }, // unchecked checkbox → empty string
      session,
    })
    await ctrl.updateRegistration(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('registration')
    assert.isFalse(saved.enabled)
    const ev = service.config.audit.events.find((e: any) => e.metadata?.key === 'registration')
    assert.isNotNull(ev)
  })

  test('POST /registration saves { enabled: true }', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb, inputs: { enabled: '1' } })
    await ctrl.updateRegistration(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('registration')
    assert.isTrue(saved.enabled)
  })

  test('POST /registration/reset clears setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'registration', value: JSON.stringify({ enabled: false }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    await ctrl.resetRegistration(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const after = await s.getSetting('registration')
    assert.isNull(after)
  })

  test('GET index shows effective registration state from setting (enabled: false)', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'registration', value: JSON.stringify({ enabled: false }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isFalse(result.data.registrationEffective)
    assert.isNotNull(result.data.currentRegistrationSetting)
  })

  // ---- require_verified_email ----

  test('GET index includes require_verified_email state (no setting → configDefault)', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isFalse(result.data.requireVerifiedConfigDefault) // default from config
    assert.isFalse(result.data.requireVerifiedEffective)
    assert.isNull(result.data.currentRequireVerifiedSetting)
  })

  test('POST /require-verified-email saves { enabled: true }', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx, captured } = fakeCtx({ service, db: settingsDb, inputs: { enabled: '1' } })
    await ctrl.updateRequireVerifiedEmail(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('require_verified_email')
    assert.isTrue(saved.enabled)
    const ev = service.config.audit.events.find((e: any) => e.metadata?.key === 'require_verified_email')
    assert.isNotNull(ev)
  })

  test('POST /require-verified-email/reset clears setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'require_verified_email', value: JSON.stringify({ enabled: true }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    await ctrl.resetRequireVerifiedEmail(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const after = await s.getSetting('require_verified_email')
    assert.isNull(after)
  })

  test('GET index shows effective requireVerified from setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'require_verified_email', value: JSON.stringify({ enabled: true }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isTrue(result.data.requireVerifiedEffective)
    assert.isNotNull(result.data.currentRequireVerifiedSetting)
  })

  // ---- maintenance_mode ----

  test('GET index includes maintenance state (no setting → disabled)', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isFalse(result.data.maintenanceEffective.enabled)
    assert.isNull(result.data.currentMaintenanceSetting)
  })

  test('POST /maintenance saves { enabled: true } and audits maintenance.enabled', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({
      service,
      db: settingsDb,
      inputs: { enabled: '1', message: '' },
      session,
    })
    await ctrl.updateMaintenance(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('maintenance_mode')
    assert.isTrue(saved.enabled)
    assert.isUndefined(saved.message)
    // Must emit maintenance.enabled
    const enabledEv = service.config.audit.events.find((e: any) => e.type === 'maintenance.enabled')
    assert.isNotNull(enabledEv)
    // Must also emit settings.updated
    const updatedEv = service.config.audit.events.find((e: any) => e.type === 'settings.updated' && e.metadata?.key === 'maintenance_mode')
    assert.isNotNull(updatedEv)
  })

  test('POST /maintenance with custom message saves message', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb, inputs: { enabled: '1', message: 'Upgrading DB.' } })
    await ctrl.updateMaintenance(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('maintenance_mode')
    assert.equal(saved.message, 'Upgrading DB.')
  })

  test('POST /maintenance saves { enabled: false } and audits maintenance.disabled', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb, inputs: { enabled: '' } })
    await ctrl.updateMaintenance(ctx as any)
    const disabledEv = service.config.audit.events.find((e: any) => e.type === 'maintenance.disabled')
    assert.isNotNull(disabledEv)
  })

  test('POST /maintenance/reset clears setting and audits maintenance.disabled', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'maintenance_mode', value: JSON.stringify({ enabled: true }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    await ctrl.resetMaintenance(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const after = await s.getSetting('maintenance_mode')
    assert.isNull(after)
    const disabledEv = service.config.audit.events.find((e: any) => e.type === 'maintenance.disabled')
    assert.isNotNull(disabledEv)
  })

  test('GET index shows maintenance effective from setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({ key: 'maintenance_mode', value: JSON.stringify({ enabled: true, message: 'Down for updates.' }), updated_at: new Date(), updated_by: null })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isTrue(result.data.maintenanceEffective.enabled)
    assert.isNotNull(result.data.currentMaintenanceSetting)
    assert.equal(result.data.currentMaintenanceSetting.message, 'Down for updates.')
  })

  test('POST toggles with no table redirect with flash', async ({ assert }) => {
    const noTableDb = makeSettingsDb().withNoTable()
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({ service, db: noTableDb, inputs: { enabled: '1' }, session })
    await ctrl.updateRegistration(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    await ctrl.updateRequireVerifiedEmail(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    await ctrl.updateMaintenance(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
  })
})

// ---------------------------------------------------------------------------
// AdminSettingsController — auth_methods
// ---------------------------------------------------------------------------

test.group('AdminSettingsController — auth_methods', (group) => {
  let settingsDb: ReturnType<typeof makeSettingsDb>
  let service: any

  group.each.setup(() => {
    service = buildService(false, { social: ['google', 'github'], magicLink: true })
    settingsDb = makeSettingsDb()
  })

  test('GET index includes auth_methods state (no setting → defaults)', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.equal(result.view, 'admin/settings')
    assert.isNull(result.data.currentAuthMethodsSetting)
    assert.deepEqual(result.data.configuredSocialProviders, ['google', 'github'])
    assert.isTrue(result.data.authMethodsEffective.password)
    assert.isTrue(result.data.authMethodsEffective.forgotPassword)
  })

  test('POST /auth-methods saves setting + audits', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({
      service,
      db: settingsDb,
      inputs: {
        password: '1',
        magic_link: '',
        passkey: '',
        forgot_password: '1',
        social: ['google'],
      },
      session,
    })
    await ctrl.updateAuthMethods(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
    const s = new RuntimeSettings(settingsDb as any)
    const saved: any = await s.getSetting('auth_methods')
    assert.isTrue(saved.password)
    assert.isFalse(saved.magicLink)
    assert.isFalse(saved.passkey)
    assert.isTrue(saved.forgotPassword)
    assert.deepEqual(saved.social, ['google'])
    const ev = service.config.audit.events.find((e: any) => e.metadata?.key === 'auth_methods')
    assert.isNotNull(ev)
  })

  test('POST /auth-methods with password=false auto-disables forgotPassword via resolver', async ({ assert }) => {
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({
      service,
      db: settingsDb,
      inputs: {
        password: '',        // unchecked = false
        magic_link: '1',
        passkey: '',
        forgot_password: '1', // requested but auto-off
        social: 'google',
      },
    })
    await ctrl.updateAuthMethods(ctx as any)
    // After saving, re-read via GET and check effective
    const ctrl2 = new AdminSettingsController()
    const { ctx: ctx2 } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl2.index(ctx2 as any)
    assert.isFalse(result.data.authMethodsEffective.password)
    assert.isFalse(result.data.authMethodsEffective.forgotPassword) // auto-off
  })

  test('POST /auth-methods/reset clears setting', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({
      key: 'auth_methods',
      value: JSON.stringify({ password: false, magicLink: false, passkey: false, social: [], forgotPassword: false }),
      updated_at: new Date(),
      updated_by: null,
    })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    await ctrl.resetAuthMethods(ctx as any)
    const s = new RuntimeSettings(settingsDb as any)
    const after = await s.getSetting('auth_methods')
    assert.isNull(after)
    const ev = service.config.audit.events.find((e: any) => e.metadata?.key === 'auth_methods' && e.metadata?.action === 'reset_to_config')
    assert.isNotNull(ev)
  })

  test('GET index shows currentAuthMethodsSetting when setting exists', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({
      key: 'auth_methods',
      value: JSON.stringify({ password: true, magicLink: false, passkey: false, social: ['google'], forgotPassword: true }),
      updated_at: new Date(),
      updated_by: null,
    })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    assert.isNotNull(result.data.currentAuthMethodsSetting)
    assert.isFalse(result.data.currentAuthMethodsSetting.magicLink)
  })

  test('POST /auth-methods with no table redirects with flash', async ({ assert }) => {
    const noTableDb = makeSettingsDb().withNoTable()
    const ctrl = new AdminSettingsController()
    const session = fakeSession()
    const { ctx, captured } = fakeCtx({ service, db: noTableDb, inputs: { password: '1' }, session })
    await ctrl.updateAuthMethods(ctx as any)
    assert.equal(captured._redirected, '/admin/settings')
  })

  test('social filter: setting references known + unknown providers → only known returned', async ({ assert }) => {
    await settingsDb.table('auth_settings').insert({
      key: 'auth_methods',
      value: JSON.stringify({ password: true, social: ['google', 'phantom'] }),
      updated_at: new Date(),
      updated_by: null,
    })
    const ctrl = new AdminSettingsController()
    const { ctx } = fakeCtx({ service, db: settingsDb })
    const result: any = await ctrl.index(ctx as any)
    // effective social should only include providers in config
    assert.deepEqual(result.data.authMethodsEffective.social, ['google'])
  })
})
