import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { defineConfig, adapters } from '../index.js'
import { fakeAccountStore } from './bootstrap.js'
import AuthkitServerProvider from '../providers/authkit_server_provider.js'

function buildFakeApp(providerValue: any) {
  const singletons: Record<string, () => Promise<any>> = {}
  const app = {
    config: {
      get: (key: string) =>
        key === 'authkit' ? providerValue : key === 'app.appKey' ? 'a'.repeat(32) : undefined,
    },
    container: {
      singleton: (name: string, factory: () => Promise<any>) => {
        singletons[name] = factory
      },
      make: async () => ({ connection: () => new RedisMock() }),
    },
  } as any
  return { app, singletons }
}

test.group('authkit provider bindings', () => {
  test('liga authkit.accountStore e authkit.patStore ao store do config', async ({ assert }) => {
    const store = fakeAccountStore()
    const patStore = {
      issue: async () => ({ token: 'pat_x', pat: {} as any }),
      listForAccount: async () => [],
      revoke: async () => false,
      findActiveByToken: async () => null,
    }
    const providerValue = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: store,
      patStore,
    })
    const { app, singletons } = buildFakeApp(providerValue)
    new AuthkitServerProvider(app).register()

    assert.strictEqual(await singletons['authkit.accountStore'](), store)
    assert.strictEqual(await singletons['authkit.patStore'](), patStore)
  })

  test('authkit.patStore rejeita quando patStore não foi configurado', async ({ assert }) => {
    const providerValue = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      // patStore omitido de propósito
    })
    const { app, singletons } = buildFakeApp(providerValue)
    new AuthkitServerProvider(app).register()

    await assert.rejects(() => singletons['authkit.patStore']())
  })
})
