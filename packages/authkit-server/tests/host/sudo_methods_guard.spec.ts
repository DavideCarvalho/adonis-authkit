/**
 * Barreiras dos handlers dos métodos de sudo.
 *
 * Cobre os achados Critical do review da Task 4:
 *  - `config.sudo.methods` precisa DESABILITAR de fato o endpoint do método;
 *  - os handlers de passkey precisam exigir `c.account`.
 */

import { test } from '@japa/runner'
import { password } from '../../src/host/sudo/methods/password.js'
import { passkey } from '../../src/host/sudo/methods/passkey.js'
import { completeSudo, fail } from '../../src/host/sudo/runtime.js'
import { sudoContextFrom } from '../../src/host/controllers/account_confirm_controller.js'
import { SUDO_SESSION_KEY } from '../../src/host/sudo_mode.js'
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js'
import { CONFIRM_PASSKEY_CHALLENGE_KEY } from '../../src/host/sudo/methods/passkey.js'
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js'

const ACCOUNT = { id: 'acc-1', email: 'user@example.com' }

/** Captura os handlers registrados pelos métodos built-in, por `"<VERBO> <path>"`. */
function captureHandlers() {
  const routes = new Map<string, (ctx: any) => Promise<unknown>>()
  const router = {
    post: (p: string, h: any) => { routes.set(`POST ${p}`, h) },
    get: (p: string, h: any) => { routes.set(`GET ${p}`, h) },
  } as any
  const helpers = { contextFrom: sudoContextFrom, completeSudo, fail }
  password().register!(router, helpers)
  passkey().register!(router, helpers)
  return routes
}

function fakeCtx(opts: {
  input?: Record<string, unknown>
  qs?: Record<string, unknown>
  method?: string
  session?: Record<string, unknown>
  cfg?: Record<string, unknown>
} = {}) {
  const session: Record<string, unknown> = { [ACCOUNT_SESSION_KEY]: ACCOUNT.id, ...opts.session }
  const flashed: Record<string, unknown> = {}
  const redirects: string[] = []
  const notFounds: unknown[] = []

  const cfg = {
    messages: { ...DEFAULT_MESSAGES },
    render: async () => ({}),
    accountStore: {
      async findById(id: string) { return id === ACCOUNT.id ? ACCOUNT : null },
      async verifyCredentials(email: string, pwd: string) {
        return email === ACCOUNT.email && pwd === 'correta'
      },
      async __getRawRow() { return { password: 'hash-existente' } },
    },
    audit: { records: [] as unknown[], async record(e: unknown) { (cfg.audit.records as unknown[]).push(e) } },
    ...opts.cfg,
  } as any

  const ctx = {
    session: {
      get: (k: string) => session[k],
      put: (k: string, v: unknown) => { session[k] = v },
      forget: (k: string) => { delete session[k] },
      flash: (k: string, v: unknown) => { flashed[k] = v },
      flashMessages: { get: (k: string) => flashed[k] ?? null },
    },
    request: {
      csrfToken: 'csrf-token',
      method: () => opts.method ?? 'POST',
      only: (keys: string[]) => Object.fromEntries(keys.map((k) => [k, opts.input?.[k]])),
      input: (k: string) => opts.input?.[k],
      qs: () => opts.qs ?? {},
      ip: () => '203.0.113.1',
    },
    response: {
      redirect: (url: string) => { redirects.push(url); return { _redirect: url } },
      notFound: (body?: unknown) => { notFounds.push(body ?? null); return { _notFound: body ?? null } },
      unauthorized: (body?: unknown) => ({ _unauthorized: body ?? null }),
    },
    containerResolver: { make: async () => ({ config: cfg }) },
  } as any

  return { ctx, cfg, session, flashed, redirects, notFounds }
}

/** AccountStore "discoverable/usernameless": resolve a credencial pelo rawId, não pela conta. */
const discoverableStore = {
  async findById() { return null },
  listPasskeys: async () => [{ id: 'pk-1' }],
  generatePasskeyAuthenticationOptions: async () => ({ challenge: 'chal-1', options: {} }),
  // Ignora o accountId — é justamente o store de terceiro que o review descreve.
  async verifyPasskeyAuthentication() { return true },
}

test.group('sudo — config.sudo.methods desabilita o endpoint (Critical 1)', () => {
  test('senha correta NÃO concede sudo quando password está fora de config.sudo.methods', async ({ assert }) => {
    const h = fakeCtx({
      input: { password: 'correta' },
      cfg: { sudo: { methods: [passkey()] } },
    })
    await captureHandlers().get('POST /account/confirm')!(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.lengthOf(h.cfg.audit.records, 0)
  })

  test('senha correta CONTINUA concedendo sudo sem config.sudo.methods (contraprova)', async ({ assert }) => {
    const h = fakeCtx({ input: { password: 'correta' } })
    await captureHandlers().get('POST /account/confirm')!(h.ctx)

    assert.isNumber(h.session[SUDO_SESSION_KEY])
  })

  test('assertion válida NÃO concede sudo quando passkey está fora de config.sudo.methods', async ({ assert }) => {
    const h = fakeCtx({
      input: { response: JSON.stringify({ id: 'cred' }) },
      session: { [CONFIRM_PASSKEY_CHALLENGE_KEY]: 'chal-1' },
      cfg: {
        sudo: { methods: [password()] },
        accountStore: {
          async findById() { return ACCOUNT },
          listPasskeys: async () => [{ id: 'pk-1' }],
          generatePasskeyAuthenticationOptions: async () => ({ challenge: 'chal-1', options: {} }),
          async verifyPasskeyAuthentication() { return true },
        },
      },
    })
    await captureHandlers().get('POST /account/confirm/passkey')!(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.lengthOf(h.cfg.audit.records, 0)
  })

  test('options de passkey não emite challenge quando passkey está fora de config.sudo.methods', async ({ assert }) => {
    const h = fakeCtx({
      cfg: {
        sudo: { methods: [password()] },
        accountStore: {
          async findById() { return ACCOUNT },
          listPasskeys: async () => [{ id: 'pk-1' }],
          generatePasskeyAuthenticationOptions: async () => ({ challenge: 'chal-1', options: {} }),
        },
      },
    })
    await captureHandlers().get('POST /account/confirm/passkey/options')!(h.ctx)

    assert.isUndefined(h.session[CONFIRM_PASSKEY_CHALLENGE_KEY])
    assert.lengthOf(h.notFounds, 1)
  })
})

test.group('sudo — handlers de passkey exigem a conta (Critical 2)', () => {
  test('assertion válida com conta inexistente NÃO concede sudo', async ({ assert }) => {
    const h = fakeCtx({
      input: { response: JSON.stringify({ id: 'cred' }) },
      session: { [CONFIRM_PASSKEY_CHALLENGE_KEY]: 'chal-1' },
      cfg: { accountStore: discoverableStore },
    })
    await captureHandlers().get('POST /account/confirm/passkey')!(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.lengthOf(h.cfg.audit.records, 0)
    assert.isNotNull(h.flashed.confirmError)
  })

  test('options com conta inexistente não emite challenge', async ({ assert }) => {
    const h = fakeCtx({ cfg: { accountStore: discoverableStore } })
    await captureHandlers().get('POST /account/confirm/passkey/options')!(h.ctx)

    assert.isUndefined(h.session[CONFIRM_PASSKEY_CHALLENGE_KEY])
    assert.lengthOf(h.notFounds, 1)
  })
})
