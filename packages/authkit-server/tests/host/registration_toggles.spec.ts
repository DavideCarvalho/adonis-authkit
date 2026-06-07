/**
 * Tests for the runtime toggle guards in AuthRegistrationController:
 *   - Registration disabled: GET + POST signup show/reject correctly
 *   - Maintenance mode: GET + POST signup/forgot show maintenance
 *
 * Uses controller-unit-test pattern (fake ctx + captured render).
 */

import { test } from '@japa/runner'
import AuthRegistrationController from '../../src/host/controllers/registration_controller.js'

// ---------- helpers ----------

/** Builds a minimal RuntimeSettings-compatible DB that returns a given row (or null). */
function fakeSettingsDb(rows: Record<string, any> = {}) {
  const storeKey = (key: string, orgId: string | null) => `${key}|${orgId ?? ''}`
  const store = new Map<string, { key: string; org_id: string | null; value: string }>(
    Object.entries(rows).map(([k, v]) => [storeKey(k, null), { key: k, org_id: null, value: JSON.stringify(v) }])
  )
  function makeChain(filters: Array<{ col: string; val: string | null; isNull: boolean }>) {
    return {
      where(col: string, val: string) { return makeChain([...filters, { col, val, isNull: false }]) },
      whereNull(col: string) { return makeChain([...filters, { col, val: null, isNull: true }]) },
      async first() {
        const keyFilter = filters.find(f => f.col === 'key')
        const orgFilter = filters.find(f => f.col === 'organization_id')
        if (!keyFilter) return null
        const orgId: string | null = orgFilter ? (orgFilter.isNull ? null : orgFilter.val) : null
        const v = store.get(storeKey(keyFilter.val!, orgId))
        return v ? { key: v.key, organization_id: v.org_id, value: v.value, updated_at: new Date(), updated_by: null } : null
      },
    }
  }
  return {
    from(...args: any[]) { return (this as any).table(...args) },
    table(_n: string) {
      return {
        // Probe: select().limit() → resolves (table present).
        select(_cols?: string) {
          return { limit(_n2: number) { return Promise.resolve([]) } }
        },
        where(col: string, val: string) { return makeChain([{ col, val, isNull: false }]) },
        whereNull(col: string) { return makeChain([{ col, val: null, isNull: true }]) },
      }
    },
  }
}

function noTableDb() {
  return {
    // table() throws → probe catches → tablePresent = false.
    from() { return this.table() },
    table() { throw new Error('no table') },
  }
}

interface RenderCapture { view: string; data: Record<string, any> }

function buildService(opts: {
  db: any
  registrationEnabled?: boolean
  extraMessages?: Record<string, string>
}) {
  const messages: Record<string, string> = {
    'maintenance.default_message': 'Under maintenance.',
    'maintenance.admin_login_note': 'Admins can log in.',
    'errors.registration_disabled': 'Registration disabled.',
    ...(opts.extraMessages ?? {}),
  }
  const interactionsModule = {
    details: async () => ({
      uid: 'test-uid',
      params: { client_id: 'web' },
    }),
  }
  const config = {
    render: async (_ctx: any, view: string, data: any): Promise<RenderCapture> => ({ view, data }),
    messages,
    branding: {
      default: { appName: 'Acme', logoUrl: null },
      clients: {},
      firstParty: [],
      company: undefined,
    },
    botProtection: undefined,
    registration: { enabled: opts.registrationEnabled ?? true },
  }
  // The service object (returned by containerResolver.make('authkit.server'))
  // exposes both `config` and `interactions` at the top level.
  return { config, interactions: interactionsModule }
}

function fakeCtx(service: any, db: any, body: Record<string, string> = {}) {
  const captured: { rendered: RenderCapture | null } = { rendered: null }
  const ctx = {
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') return service
        if (key === 'lucid.db') return db
        throw new Error(`unknown: ${key}`)
      },
    },
    request: {
      csrfToken: 'csrf',
      param: (_k: string) => 'test-uid',
      only: (keys: string[]) => {
        const out: any = {}
        for (const k of keys) out[k] = body[k] ?? ''
        return out
      },
      input: (k: string) => body[k] ?? '',
      ip: () => '1.2.3.4',
    },
    session: { get: () => undefined, put: () => {} },
    response: { redirect: (_url: string) => undefined },
  }
  return { ctx, captured }
}

// ---------- tests: registration disabled ----------

test.group('AuthRegistrationController — registration disabled', () => {
  test('GET signup shows registrationDisabled=true when setting { enabled: false }', async ({ assert }) => {
    const db = fakeSettingsDb({ registration: { enabled: false } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'signup')
    assert.isTrue(result.data.registrationDisabled)
  })

  test('POST signup rejects when setting { enabled: false }', async ({ assert }) => {
    const db = fakeSettingsDb({ registration: { enabled: false } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db, { fullName: 'Alice', email: 'a@test.com', password: 'password123' })

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.signup(ctx as any)
    assert.equal(result.view, 'signup')
    assert.isTrue(result.data.registrationDisabled)
  })

  test('GET signup shows form normally when registration enabled (no setting)', async ({ assert }) => {
    const db = noTableDb()
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'signup')
    assert.notProperty(result.data, 'registrationDisabled')
  })

  test('GET signup shows form when config static enabled=false (setting absent → config default)', async ({ assert }) => {
    // When config.registration.enabled = false and no runtime setting:
    // resolveEffectiveRegistration(false, noTableSettings) → false → show disabled
    const db = noTableDb()
    const service = buildService({ db, registrationEnabled: false })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'signup')
    assert.isTrue(result.data.registrationDisabled)
  })

  test('GET signup shows form when setting overrides config to enabled=true', async ({ assert }) => {
    // Config says false, but runtime setting says true → open
    const db = fakeSettingsDb({ registration: { enabled: true } })
    const service = buildService({ db, registrationEnabled: false })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'signup')
    // Should NOT be disabled — setting overrides config
    assert.notEqual(result.data.registrationDisabled, true)
  })
})

// ---------- tests: maintenance mode ----------

test.group('AuthRegistrationController — maintenance mode', () => {
  test('GET signup shows maintenance page when maintenance enabled', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: true } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'maintenance')
  })

  test('POST signup shows maintenance page when maintenance enabled', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: true } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db, { fullName: 'Bob', email: 'b@test.com', password: 'pass123' })

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.signup(ctx as any)
    assert.equal(result.view, 'maintenance')
  })

  test('GET forgot shows maintenance page when maintenance enabled', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: true } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showForgot(ctx as any)
    assert.equal(result.view, 'maintenance')
  })

  test('POST forgot shows maintenance page when maintenance enabled', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: true } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db, { email: 'c@test.com' })

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.forgot(ctx as any)
    assert.equal(result.view, 'maintenance')
  })

  test('maintenance with custom message passes message to template', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: true, message: 'Custom msg' } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'maintenance')
    assert.equal(result.data.message, 'Custom msg')
  })

  test('signup accessible when maintenance disabled', async ({ assert }) => {
    const db = fakeSettingsDb({ maintenance_mode: { enabled: false } })
    const service = buildService({ db })
    const { ctx } = fakeCtx(service, db)

    const ctrl = new AuthRegistrationController()
    const result: any = await ctrl.showSignup(ctx as any)
    assert.equal(result.view, 'signup')
    assert.notEqual(result.view, 'maintenance')
  })
})
