import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { OidcService } from '../src/provider/oidc_service.js'
import { fakeAccountStore } from './bootstrap.js'

test.group('OidcService', () => {
  test('expõe provider e callback handler', async ({ assert }) => {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed' },
        clients: [{ clientId: 'app1', clientSecret: 's', redirectUris: ['https://app1/cb'] }],
        accountStore: fakeAccountStore(),
      })
    )
    const service = new OidcService(cfg!, 'a'.repeat(32))
    assert.isOk(service.provider)
    assert.isFunction(service.callback)
    assert.equal(service.provider.issuer, 'https://auth.test')
  })

  test('expõe .config com mountPath e render da defineConfig', async ({ assert }) => {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed' },
        clients: [{ clientId: 'app1', clientSecret: 's', redirectUris: ['https://app1/cb'] }],
        accountStore: fakeAccountStore(),
        mountPath: '/oidc',
        render: () => {},
      })
    )
    const service = new OidcService(cfg!, 'a'.repeat(32))
    assert.equal(service.config.mountPath, '/oidc')
    assert.isFunction(service.config.render)
  })

  test('verifyClientCredentials aceita par correto e rejeita errado/inexistente', async ({ assert }) => {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed' },
        clients: [{ clientId: 'rs1', clientSecret: 's3cr3t', redirectUris: ['https://rs1/cb'] }],
        accountStore: fakeAccountStore(),
      })
    )
    const service = new OidcService(cfg!, 'a'.repeat(32))
    assert.isTrue(service.verifyClientCredentials('rs1', 's3cr3t'))
    assert.isFalse(service.verifyClientCredentials('rs1', 'errado'))
    assert.isFalse(service.verifyClientCredentials('naoexiste', 's3cr3t'))
  })
})
