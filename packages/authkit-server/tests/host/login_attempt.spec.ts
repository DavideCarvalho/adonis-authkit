import { test } from '@japa/runner'
import { attemptPasswordLogin } from '../../src/host/login_attempt.js'
import { __setLockoutLimiterLoaderForTests } from '../../src/host/account_lockout.js'
import { resolveLockout } from '../../src/define_config.js'
import type { ResolvedServerConfig } from '../../src/define_config.js'
import type { AuditEvent, AuditSink } from '../../src/audit/audit_sink.js'
import type { AccountStore, AuthAccount } from '../../src/accounts/account_store.js'

/** Limiter stub in-memory (mesma superfície usada pelo account_lockout). */
function makeLimiterStub() {
  const counters = new Map<string, number>()
  const blocks = new Map<string, number>()
  function instance() {
    return {
      async increment(key: string) {
        const next = (counters.get(key) ?? 0) + 1
        counters.set(key, next)
        return { consumed: next, availableIn: 0 }
      },
      async get(key: string) {
        return { consumed: counters.get(key) ?? 0, availableIn: 0 }
      },
      async delete(key: string) {
        counters.delete(key)
        blocks.delete(key)
        return true
      },
      async block(key: string, duration: number) {
        blocks.set(key, duration)
        return { consumed: 1, availableIn: duration }
      },
      async isBlocked(key: string) {
        return blocks.has(key)
      },
      async availableIn(key: string) {
        return blocks.get(key) ?? 0
      },
    }
  }
  return { use: () => instance(), _blocks: blocks }
}

const ACCOUNT: AuthAccount = { id: 'u1', email: 'a@b.com', globalRoles: [] }

/** Config mínima: só os campos que attemptPasswordLogin toca. */
function makeCfg(opts: {
  verify?: AccountStore['verifyCredentials']
  audit?: AuditSink
  lockoutEnabled?: boolean
  maxAttempts?: number
}): ResolvedServerConfig {
  const accountStore = {
    verifyCredentials:
      opts.verify ?? (async (email: string) => (email === ACCOUNT.email ? { ...ACCOUNT } : null)),
  } as unknown as AccountStore
  return {
    accountStore,
    audit: opts.audit,
    lockout: resolveLockout({
      enabled: opts.lockoutEnabled ?? true,
      maxAttempts: opts.maxAttempts ?? 5,
    }),
  } as unknown as ResolvedServerConfig
}

test.group('attemptPasswordLogin', (group) => {
  let stub: ReturnType<typeof makeLimiterStub>
  group.each.setup(() => {
    stub = makeLimiterStub()
    __setLockoutLimiterLoaderForTests(() => Promise.resolve(stub))
    return () => __setLockoutLimiterLoaderForTests(undefined)
  })

  test('sucesso devolve { ok: true, account } e limpa falhas', async ({ assert }) => {
    const cfg = makeCfg({})
    const res = await attemptPasswordLogin(cfg, {
      email: 'a@b.com',
      password: 'secret',
      ip: '1.2.3.4',
    })
    assert.isTrue(res.ok)
    if (res.ok) assert.equal(res.account.id, 'u1')
  })

  test('falha emite login.failure SEM clientId e devolve { ok: false, locked: false }', async ({
    assert,
  }) => {
    const events: AuditEvent[] = []
    const sink: AuditSink = { record: async (e) => { events.push(e) } }
    const cfg = makeCfg({ audit: sink })

    // email desconhecido → verifyCredentials retorna null → falha
    const res = await attemptPasswordLogin(cfg, {
      email: 'nope@b.com',
      password: 'x',
      ip: '9.9.9.9',
    })
    assert.isFalse(res.ok)
    if (!res.ok) {
      assert.isFalse(res.locked)
    }
    const fail = events.find((e) => e.type === 'login.failure')!
    assert.equal(fail.email, 'nope@b.com')
    assert.equal(fail.ip, '9.9.9.9')
    // SEM clientId no fluxo do console (não fornecido)
    assert.notProperty(fail, 'clientId')
  })

  test('falha emite login.failure COM clientId quando fornecido', async ({ assert }) => {
    const events: AuditEvent[] = []
    const sink: AuditSink = { record: async (e) => { events.push(e) } }
    const cfg = makeCfg({ audit: sink })

    const res = await attemptPasswordLogin(cfg, {
      email: 'nope@b.com',
      password: 'x',
      ip: '9.9.9.9',
      clientId: 'app1',
    })
    assert.isFalse(res.ok)
    const fail = events.find((e) => e.type === 'login.failure')!
    assert.equal(fail.clientId, 'app1')
  })

  test('falha com clientId null preserva clientId: null no evento', async ({ assert }) => {
    const events: AuditEvent[] = []
    const sink: AuditSink = { record: async (e) => { events.push(e) } }
    const cfg = makeCfg({ audit: sink })

    await attemptPasswordLogin(cfg, {
      email: 'nope@b.com',
      password: 'x',
      ip: null,
      clientId: null,
    })
    const fail = events.find((e) => e.type === 'login.failure')!
    assert.property(fail, 'clientId')
    assert.isNull(fail.clientId)
  })

  test('conta desabilitada: rejeita login com { disabled: true } e emite login.failure', async ({
    assert,
  }) => {
    const events: AuditEvent[] = []
    const sink: AuditSink = { record: async (e) => { events.push(e) } }
    // accountStore com a capacidade de status: a conta a@b.com está desabilitada.
    const accountStore = {
      verifyCredentials: async (email: string) =>
        email === ACCOUNT.email ? { ...ACCOUNT } : null,
      disableAccount: async () => {},
      enableAccount: async () => {},
      isDisabled: async (id: string) => id === ACCOUNT.id,
    } as unknown as AccountStore
    const cfg = {
      accountStore,
      audit: sink,
      lockout: resolveLockout({ enabled: true, maxAttempts: 5 }),
    } as unknown as ResolvedServerConfig

    const res = await attemptPasswordLogin(cfg, {
      email: 'a@b.com',
      password: 'secret',
      ip: '1.2.3.4',
    })
    assert.isFalse(res.ok)
    if (!res.ok) {
      assert.isFalse(res.locked)
      assert.isTrue(res.disabled)
    }
    const fail = events.find((e) => e.type === 'login.failure')!
    assert.equal((fail.metadata as any)?.reason, 'disabled')
  })

  test('conta habilitada (isDisabled=false) faz login normalmente', async ({ assert }) => {
    const accountStore = {
      verifyCredentials: async (email: string) =>
        email === ACCOUNT.email ? { ...ACCOUNT } : null,
      disableAccount: async () => {},
      enableAccount: async () => {},
      isDisabled: async () => false,
    } as unknown as AccountStore
    const cfg = {
      accountStore,
      lockout: resolveLockout({ enabled: true, maxAttempts: 5 }),
    } as unknown as ResolvedServerConfig
    const res = await attemptPasswordLogin(cfg, { email: 'a@b.com', password: 'secret', ip: null })
    assert.isTrue(res.ok)
  })

  test('e-mail não verificado + requireVerifiedEmail: rejeita com { unverified: true }', async ({
    assert,
  }) => {
    const events: AuditEvent[] = []
    const sink: AuditSink = { record: async (e) => { events.push(e) } }
    const accountStore = {
      verifyCredentials: async (email: string) =>
        email === ACCOUNT.email ? { ...ACCOUNT } : null,
      isEmailVerified: async () => false,
    } as unknown as AccountStore
    const cfg = {
      accountStore,
      audit: sink,
      lockout: resolveLockout({ enabled: true, maxAttempts: 5 }),
      login: { requireVerifiedEmail: true },
    } as unknown as ResolvedServerConfig

    const res = await attemptPasswordLogin(cfg, { email: 'a@b.com', password: 'secret', ip: '1.2.3.4' })
    assert.isFalse(res.ok)
    if (!res.ok) assert.isTrue(res.unverified)
    const fail = events.find((e) => e.type === 'login.failure')!
    assert.equal((fail.metadata as any)?.reason, 'unverified')
  })

  test('e-mail verificado + requireVerifiedEmail: login normal', async ({ assert }) => {
    const accountStore = {
      verifyCredentials: async (email: string) =>
        email === ACCOUNT.email ? { ...ACCOUNT } : null,
      isEmailVerified: async () => true,
    } as unknown as AccountStore
    const cfg = {
      accountStore,
      lockout: resolveLockout({ enabled: true, maxAttempts: 5 }),
      login: { requireVerifiedEmail: true },
    } as unknown as ResolvedServerConfig
    const res = await attemptPasswordLogin(cfg, { email: 'a@b.com', password: 'secret', ip: null })
    assert.isTrue(res.ok)
  })

  test('requireVerifiedEmail mas store SEM isEmailVerified: degrada (não bloqueia)', async ({
    assert,
  }) => {
    // Store sem a capability → a checagem é no-op (capability-probed).
    const cfg = makeCfg({})
    ;(cfg as any).login = { requireVerifiedEmail: true }
    const res = await attemptPasswordLogin(cfg, { email: 'a@b.com', password: 'secret', ip: null })
    assert.isTrue(res.ok)
  })

  test('travada: não verifica a senha e devolve { ok: false, locked: true, retryAfterSec }', async ({
    assert,
  }) => {
    let verifyCalled = 0
    const cfg = makeCfg({
      maxAttempts: 2,
      verify: async () => {
        verifyCalled++
        return null
      },
    })
    // 2 falhas → trava (keyed por email)
    await attemptPasswordLogin(cfg, { email: 'lock@b.com', password: 'x', ip: null })
    await attemptPasswordLogin(cfg, { email: 'lock@b.com', password: 'x', ip: null })
    const before = verifyCalled

    const res = await attemptPasswordLogin(cfg, { email: 'lock@b.com', password: 'x', ip: null })
    assert.isFalse(res.ok)
    if (!res.ok) {
      assert.isTrue(res.locked)
      assert.isAbove(res.retryAfterSec ?? 0, 0)
    }
    // a 3ª tentativa NÃO chamou verifyCredentials (curto-circuito pelo lock)
    assert.equal(verifyCalled, before)
  })
})
