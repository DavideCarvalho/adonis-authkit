import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import instance from 'oidc-provider/lib/helpers/weak_cache.js'
import { defineConfig, adapters } from '../src/define_config.js'
import { OidcService } from '../src/provider/oidc_service.js'
import { fakeAccountStore } from './bootstrap.js'
import type { BrandingConfig } from '../src/host/branding.js'

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

  // ── Gate de least-privilege: roles/org_* só para clients first-party ──────────
  // Mesmo que o client peça `scope=roles`, a emissão das claims de roles/org só
  // acontece quando o clientId está em `branding.firstParty`. Montamos um ctx fake
  // com `oidc.client.clientId` e verificamos presença/ausência das claims no
  // resultado de `findAccount(ctx, sub).claims()`.
  async function serviceWithBranding(branding: BrandingConfig) {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed' },
        clients: [
          { clientId: 'first-app', clientSecret: 's', redirectUris: ['https://first-app/cb'] },
          { clientId: 'third-app', clientSecret: 's', redirectUris: ['https://third-app/cb'] },
        ],
        accountStore: fakeAccountStore(),
        branding,
      })
    )
    return new OidcService(cfg!, 'a'.repeat(32))
  }

  const branding: BrandingConfig = {
    company: 'ACME',
    clients: {},
    default: { appName: 'ACME', accent: '#000', accentSoft: '#111', tagline: 't' },
    firstParty: ['first-app'],
  }

  async function claimsFor(service: OidcService, clientId: string) {
    const findAccount = (instance(service.provider as any) as any).configuration.findAccount
    const ctx = { oidc: { client: { clientId } } }
    const account = await findAccount(ctx, 'u1')
    return account.claims('id_token', 'roles')
  }

  test('findAccount.claims emite roles/org SOMENTE para client first-party', async ({
    assert,
  }) => {
    const service = await serviceWithBranding(branding)

    // First-party: roles presente (fakeAccountStore retorna globalRoles=['ADMIN']).
    const fp = await claimsFor(service, 'first-app')
    assert.deepEqual(fp['roles'], ['ADMIN'])

    // Third-party: NUNCA recebe roles, mesmo pedindo scope=roles.
    const tp = await claimsFor(service, 'third-app')
    assert.notProperty(tp, 'roles')
    assert.notProperty(tp, 'org_id')
    assert.notProperty(tp, 'org_slug')
    assert.notProperty(tp, 'org_role')

    // Identidade básica continua para ambos.
    assert.equal(fp['sub'], 'u1')
    assert.equal(tp['sub'], 'u1')
    assert.equal(tp['email'], 'a@b.com')
  })
})
