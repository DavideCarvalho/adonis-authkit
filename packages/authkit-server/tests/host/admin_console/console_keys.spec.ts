import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../../../src/define_config.js'
import { OidcService } from '../../../src/provider/oidc_service.js'
import { KeystoreManager } from '../../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../../src/keys/keystore_codec.js'
import { FileKeystoreVault } from '../../../src/keys/keystore_vault.js'
import ConsoleKeysController from '../../../src/host/admin_console/console_keys_controller.js'
import { adminGuard } from '../../../src/host/register_auth_host.js'
import { fakeAccountStore } from '../../bootstrap.js'
import { ACCOUNT_SESSION_KEY } from '../../../src/host/middleware/account_auth.js'

function mgr(path: string) {
  return new KeystoreManager(new FileKeystoreVault(path), new KeystoreCodec({ encrypt: false }), 'RS256')
}

/**
 * Fake ctx para os controllers do console admin. `service` é resolvido para
 * `authkit.server`; `lucid.db` lança (sem DB nos testes), então
 * `getSettingsService` retorna null → política default (rotação off).
 * Captura status/body das respostas de erro.
 */
function fakeCtx(opts: {
  service?: any
  body?: any
  sessionUserId?: string
  adminRoles?: string[]
}) {
  let status = 200
  let body: any
  const captured = { status: () => status, body: () => body }
  const setBody = (b: any) => {
    body = b
    return b
  }
  const ctx = {
    request: {
      body: () => opts.body ?? {},
      ip: () => '127.0.0.1',
    },
    response: {
      status: (s: number) => {
        status = s
        return { send: setBody }
      },
      send: setBody,
      notFound: (b: any) => {
        status = 404
        return setBody(b)
      },
      redirect: (url: string) => {
        status = 302
        body = { redirect: url }
        return undefined
      },
    },
    session: {
      get: (k: string) => (k === ACCOUNT_SESSION_KEY ? opts.sessionUserId : undefined),
    },
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') return opts.service
        // lucid.db indisponível nos testes → getSettingsService cai no catch (null).
        throw new Error(`no binding for ${key}`)
      },
    },
  } as any
  return { ctx, captured }
}

async function makeService(path: string, port: number) {
  const m = mgr(path)
  await m.ensure()
  const fakeApp = {
    container: { make: async () => ({ connection: () => new RedisMock() }) },
    makePath: (p: string) => p,
  } as any
  const cfg = await configProvider.resolve(
    fakeApp,
    defineConfig({
      issuer: `http://localhost:${port}`,
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed', algorithm: 'RS256', store: path, encrypt: false },
      clients: [],
      accountStore: fakeAccountStore(),
      admin: { enabled: true, roles: ['ADMIN'] },
    })
  )
  const service = new OidcService(cfg!, 'a'.repeat(32), undefined, {
    jwksLoader: async () => {
      const s = (await m.read())!
      return { keys: s.keys.map(({ iat, ...j }: any) => j) }
    },
    keystoreHead: () => m.head(),
    keystoreManager: async () => m,
  })
  return { service, m }
}

test.group('Console API /keys (session-authed)', (group) => {
  let dir: string, path: string
  group.each.setup(() => {
    dir = mkdtempSync(join(tmpdir(), 'authkit-consolekeys-'))
    path = join(dir, 'jwks.json')
    return () => rmSync(dir, { recursive: true, force: true })
  })

  // ─── status ────────────────────────────────────────────────────────────────

  test('GET {ap}/api/keys → 200 com ageDays numérico e policy.enabled false', async ({ assert }) => {
    const { service } = await makeService(path, 9980)
    const ctrl = new ConsoleKeysController()
    const res: any = await ctrl.status(fakeCtx({ service }).ctx)
    assert.isNumber(res.ageDays)
    assert.equal(res.policy.enabled, false)
    // Sem política habilitada → sem ETA.
    assert.equal(res.nextRotationInDays, null)
  })

  test('GET {ap}/api/keys → 501 quando jwks não é managed+store', async ({ assert }) => {
    // svc sem keystoreManager → keystoreAgeDays() retorna null.
    const svc = { keystoreAgeDays: async () => null }
    const ctrl = new ConsoleKeysController()
    const { ctx, captured } = fakeCtx({ service: svc })
    await ctrl.status(ctx)
    assert.equal(captured.status(), 501)
    assert.equal(captured.body().error.code, 'not_implemented')
  })

  // ─── rotate ────────────────────────────────────────────────────────────────

  test('POST {ap}/api/keys/rotate → rotated:true e novo kid', async ({ assert }) => {
    const { service, m } = await makeService(path, 9981)
    const ctrl = new ConsoleKeysController()

    const before = (await m.read())!
    const beforeKids = before.keys.map((k: any) => k.kid)

    const rotated: any = await ctrl.rotate(fakeCtx({ service, body: {} }).ctx)
    assert.equal(rotated.rotated, true)
    assert.isString(rotated.newKid)
    assert.notInclude(beforeKids, rotated.newKid)

    // O keystore mudou: o novo kid está presente.
    const after = (await m.read())!
    const afterKids = after.keys.map((k: any) => k.kid)
    assert.include(afterKids, rotated.newKid)
    assert.isAbove(afterKids.length, 0)
  })

  test('POST {ap}/api/keys/rotate → 501 quando jwks não é managed+store', async ({ assert }) => {
    const svc = { keystoreAgeDays: async () => null }
    const ctrl = new ConsoleKeysController()
    const { ctx, captured } = fakeCtx({ service: svc })
    await ctrl.rotate(ctx)
    assert.equal(captured.status(), 501)
    assert.equal(captured.body().error.code, 'not_implemented')
  })

  // ─── adminGuard barrier ────────────────────────────────────────────────────

  test('sem sessão → adminGuard redireciona para /account/login', async ({ assert }) => {
    const { service } = await makeService(path, 9982)
    // Monta um ctx que simula adminGuard: sem sessão (sessionUserId undefined).
    const { ctx, captured } = fakeCtx({ service, sessionUserId: undefined })
    let nexted = false
    await adminGuard(ctx, async () => {
      nexted = true
    })
    assert.isFalse(nexted)
    // O adminGuard faz redirect (302) para o login.
    assert.equal(captured.status(), 302)
  })

  test('sessão sem role admin → adminGuard não deixa passar', async ({ assert }) => {
    const { service } = await makeService(path, 9983)
    // Sobrescreve findById para retornar uma conta SEM role ADMIN.
    const noAdminService = {
      ...service,
      config: {
        ...service.config,
        admin: { enabled: true, roles: ['ADMIN'] },
        accountStore: {
          ...service.config.accountStore,
          findById: async (_id: string) => ({ id: _id, email: 'noadmin@example.com', globalRoles: [] }),
        },
      },
    }
    const { ctx, captured } = fakeCtx({ service: noAdminService, sessionUserId: 'some-user-id' })
    let nexted = false
    await adminGuard(ctx, async () => {
      nexted = true
    })
    assert.isFalse(nexted)
    // Redireciona (não vaza a existência do console admin).
    assert.equal(captured.status(), 302)
  })

  test('sessão com role admin → adminGuard deixa passar', async ({ assert }) => {
    const { service } = await makeService(path, 9984)
    const account = await service.config.accountStore.create({
      email: 'admin@example.com',
      password: 'pw',
      globalRoles: ['ADMIN'],
    })
    const { ctx } = fakeCtx({ service, sessionUserId: account.id })
    let nexted = false
    await adminGuard(ctx, async () => {
      nexted = true
    })
    assert.isTrue(nexted)
  })
})
