import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import instance from 'oidc-provider/lib/helpers/weak_cache.js'
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

  // ── L3 (RISCO ACEITO): roles/org_* permanecem no scope `profile` ──────────────
  // Mover para um scope `roles` dedicado quebraria a autorização em prod (o
  // authkit-client lê hasGlobalRole do claim `roles` do token e os apps pedem só
  // `openid profile email offline_access`). Mantemos em `profile` — só há clients
  // first-party, então não há vazamento para terceiros hoje. Este teste FIXA essa
  // decisão para que ninguém mova as claims sem antes gatear por first-party.
  test('L3: claim de roles e org_* permanecem no scope `profile` (first-party only)', async ({
    assert,
  }) => {
    const cfg = await resolved()
    const provider = buildProvider(cfg!, {
      appKey: 'a'.repeat(32),
      findAccount: async (_ctx: any, sub: string) => ({ accountId: sub, claims: async () => ({ sub }) }),
    })
    const claims = (instance(provider as any) as any).configuration.claims

    // `profile` carrega roles + claims de org (chegam no ID token sem scope extra).
    const profileClaims = Object.keys(claims.profile ?? {})
    assert.includeMembers(profileClaims, ['name', 'picture', cfg!.globalRolesClaim, 'org_id', 'org_slug', 'org_role'])

    // O scope `roles` dedicado também mapeia a claim de roles (para quem optar por pedi-lo).
    const rolesClaims = Object.keys(claims.roles ?? {})
    assert.includeMembers(rolesClaims, [cfg!.globalRolesClaim])
  })
})
