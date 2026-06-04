import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { buildProvider } from '../src/provider/build_provider.js'
import { fakeAccountStore } from './bootstrap.js'

async function resolved() {
  const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
  return configProvider.resolve(
    fakeApp,
    defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients: [
        {
          clientId: 'app1',
          clientSecret: 's',
          redirectUris: ['https://app1/cb'],
          postLogoutRedirectUris: ['https://app1/'],
          grants: ['authorization_code', 'refresh_token'],
          backchannelLogoutUri: 'https://app1/auth/backchannel-logout',
          backchannelLogoutSessionRequired: true,
        },
      ],
      accountStore: fakeAccountStore(),
    })
  )
}

test.group('buildProvider', () => {
  test('instancia um Provider OIDC com issuer', async ({ assert }) => {
    const cfg = await resolved()
    const provider = buildProvider(cfg!, {
      appKey: 'a'.repeat(32),
      findAccount: async (_ctx: any, sub: string) => ({ accountId: sub, claims: async () => ({ sub }) }),
    })
    assert.equal(provider.issuer, 'https://auth.test')
    assert.equal(provider.constructor.name, 'Provider')
  })

  test('aceita findAccount no-account (retorna undefined)', async ({ assert }) => {
    const cfg = await resolved()
    const provider = buildProvider(cfg!, { appKey: 'a'.repeat(32), findAccount: async () => undefined })
    assert.isOk(provider)
  })

  test('mapeia postLogoutRedirectUris para post_logout_redirect_uris do client', async ({
    assert,
  }) => {
    const cfg = await resolved()
    const provider = buildProvider(cfg!, {
      appKey: 'a'.repeat(32),
      findAccount: async (_ctx: any, sub: string) => ({ accountId: sub, claims: async () => ({ sub }) }),
    })
    const client = await (provider as any).Client.find('app1')
    assert.isOk(client)
    assert.deepEqual(client.metadata().post_logout_redirect_uris, ['https://app1/'])
  })

  test('habilita backchannelLogout e mapeia backchannel_logout_uri do client', async ({
    assert,
  }) => {
    const cfg = await resolved()
    const provider = buildProvider(cfg!, {
      appKey: 'a'.repeat(32),
      findAccount: async (_ctx: any, sub: string) => ({
        accountId: sub,
        claims: async () => ({ sub }),
      }),
    })
    // O oidc-provider só ACEITA backchannel_logout_uri no metadata do client quando a
    // feature backchannelLogout está habilitada — caso contrário a propriedade é
    // rejeitada/descartada. Logo, a presença abaixo prova a feature ligada + o mapeamento.
    const client = await (provider as any).Client.find('app1')
    const meta = client.metadata()
    assert.equal(meta.backchannel_logout_uri, 'https://app1/auth/backchannel-logout')
    assert.isTrue(meta.backchannel_logout_session_required)
  })
})
