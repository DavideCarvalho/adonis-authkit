import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { fakeAccountStore } from './bootstrap.js'

test.group('defineConfig (server)', () => {
  test('resolve config com adapter, jwks, ttl e findAccount materializados', async ({ assert }) => {
    const fakeApp = {
      container: { make: async () => ({ connection: () => new RedisMock() }) },
    } as any

    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      ttl: { accessToken: '15m', refreshToken: '30d' },
      accountStore: fakeAccountStore(),
    })

    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.equal(resolved.issuer, 'https://auth.test')
    assert.isFunction(resolved.AdapterClass)
    assert.lengthOf(resolved.jwks.keys, 1)
    assert.equal(resolved.ttl.accessToken, 900) // 15m em segundos
    assert.equal(resolved.ttl.refreshToken, 2592000) // 30d
    assert.equal(resolved.globalRolesClaim, 'roles') // default
    assert.isFunction(resolved.findAccount)
    const acc = await resolved.findAccount('u1')
    assert.equal(acc!.email, 'a@b.com')
  })

  test('carrega verifyCredentials quando fornecido', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore({ verifyCredentials: async (email) => (email === 'a@b.com' ? { id: 'u1', email, globalRoles: [] } : null) }),
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isFunction(resolved!.verifyCredentials)
    assert.deepEqual(await resolved!.verifyCredentials!('a@b.com', 'x'), { id: 'u1' })
    assert.isNull(await resolved!.verifyCredentials!('no@b.com', 'x'))
  })

  test('toSeconds converte unidades', async ({ assert }) => {
    const { toSeconds } = await import('../src/define_config.js')
    assert.equal(toSeconds('30s', 0), 30)
    assert.equal(toSeconds('5m', 0), 300)
    assert.equal(toSeconds('2h', 0), 7200)
    assert.equal(toSeconds('1d', 0), 86400)
    assert.equal(toSeconds(42, 0), 42)
    assert.equal(toSeconds(undefined, 99), 99)
  })

  test('resolve config com host-kit (render/branding/social/mountPath/patIntrospectionSecret)', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { inertiaRenderer } = await import('../src/host/renderers/inertia_renderer.js')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      mountPath: '/oidc',
      render: inertiaRenderer({ prefix: 'authkit' }),
      branding: { company: 'C', clients: {}, default: { appName: 'x', accent: '#000', accentSoft: '#111', tagline: 't' }, firstParty: [] },
      social: { providers: ['google'] },
      patIntrospectionSecret: 's3cr3t',
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.equal(resolved.mountPath, '/oidc')
    assert.isFunction(resolved.render)
    assert.deepEqual(resolved.social, { providers: ['google'] })
    assert.equal(resolved.branding!.company, 'C')
    assert.equal(resolved.patIntrospectionSecret, 's3cr3t')
  })

  test('rateLimit ligado por default (enabled true)', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isTrue(resolved.rateLimit.enabled)
    // Buckets default determinísticos.
    assert.deepEqual(resolved.rateLimit.login, { points: 10, duration: '1 min' })
    assert.deepEqual(resolved.rateLimit.introspection, { points: 60, duration: '1 min' })
  })

  test('rateLimit resolve defaults quando enabled sem buckets explícitos', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      rateLimit: { enabled: true },
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isTrue(resolved.rateLimit.enabled)
    assert.deepEqual(resolved.rateLimit.login, { points: 10, duration: '1 min' })
    assert.deepEqual(resolved.rateLimit.introspection, { points: 60, duration: '1 min' })
  })

  test('rateLimit respeita buckets e store customizados', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      rateLimit: {
        enabled: true,
        login: { points: 5, duration: '30 secs' },
        introspection: { points: 120, duration: '5 mins' },
        store: 'redis',
      },
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isTrue(resolved.rateLimit.enabled)
    assert.deepEqual(resolved.rateLimit.login, { points: 5, duration: '30 secs' })
    assert.deepEqual(resolved.rateLimit.introspection, { points: 120, duration: '5 mins' })
    assert.equal(resolved.rateLimit.store, 'redis')
  })

  test('resolveRateLimit aplica defaults isoladamente', async ({ assert }) => {
    const { resolveRateLimit } = await import('../src/define_config.js')
    // Default (undefined) agora liga o rate-limit.
    const on0 = resolveRateLimit()
    assert.isTrue(on0.enabled)
    assert.deepEqual(on0.login, { points: 10, duration: '1 min' })

    // enabled: false explícito desliga.
    const off = resolveRateLimit({ enabled: false })
    assert.isFalse(off.enabled)
    assert.deepEqual(off.login, { points: 10, duration: '1 min' })

    const on = resolveRateLimit({ enabled: true, login: { points: 3, duration: '1 min' } })
    assert.isTrue(on.enabled)
    assert.deepEqual(on.login, { points: 3, duration: '1 min' })
    assert.deepEqual(on.introspection, { points: 60, duration: '1 min' })
  })

  test('mail é passthrough (hooks opcionais materializados quando fornecidos)', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const calls: string[] = []
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      mail: {
        onPasswordReset: async () => { calls.push('reset') },
        onEmailVerification: async () => { calls.push('verify') },
      },
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isFunction(resolved.mail!.onPasswordReset)
    assert.isFunction(resolved.mail!.onEmailVerification)
    await resolved.mail!.onPasswordReset!({ email: 'a@b.com', resetUrl: 'u', token: 't' })
    await resolved.mail!.onEmailVerification!({ email: 'a@b.com', verifyUrl: 'u', token: 't' })
    assert.deepEqual(calls, ['reset', 'verify'])
  })

  test('mail é undefined quando não fornecido', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isUndefined(resolved.mail)
  })

  test('audit é passthrough quando fornecido', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const events: string[] = []
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      audit: { record: async (e) => { events.push(e.type) } },
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isFunction(resolved.audit!.record)
    await resolved.audit!.record({ type: 'login.success', email: 'a@b.com' })
    assert.deepEqual(events, ['login.success'])
  })

  test('audit é undefined quando não fornecido', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.isUndefined(resolved.audit)
  })

  test('mountPath default é /oidc quando omitido', async ({ assert }) => {
    const RedisMock = (await import('ioredis-mock')).default
    const { configProvider } = await import('@adonisjs/core')
    const { fakeAccountStore } = await import('./bootstrap.js')
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
    })
    const resolved = await configProvider.resolve(fakeApp, provider)
    assert.equal(resolved.mountPath, '/oidc')
  })
})
