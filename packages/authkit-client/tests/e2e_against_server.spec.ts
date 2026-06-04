import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { createServer, type Server } from 'node:http'
import { configProvider } from '@adonisjs/core'
import { defineConfig as defineServer, adapters, OidcService } from '@dudousxd/adonis-authkit-server'
import { resolvers } from '../src/resolvers/factory.js'
import { buildAuthorizeUrl, generatePkce } from '../src/oidc_login.js'

const PORT = 9820
const ISSUER = `http://localhost:${PORT}`

test.group('client ↔ server (e2e)', (group) => {
  let server: Server
  group.setup(async () => {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(fakeApp, defineServer({
      issuer: ISSUER, adapter: adapters.redis({ connection: 'main' }), jwks: { source: 'managed' },
      clients: [{ clientId: 'app1', clientSecret: 's', redirectUris: [`${ISSUER}/cb`], grants: ['authorization_code','refresh_token'] }],
      findAccount: async (sub) => ({ id: sub, email: 'a@b.com', globalRoles: ['ADMIN'] }),
    }))
    const service = new OidcService(cfg!, 'a'.repeat(32))
    server = createServer(service.callback)
    await new Promise<void>((r) => server.listen(PORT, r))
    return async () => new Promise<void>((r) => server.close(() => r()))
  })

  test('authorize do client redireciona para interaction no server', async ({ assert }) => {
    const { challenge } = await generatePkce()
    const url = buildAuthorizeUrl({ issuer: ISSUER, clientId: 'app1', redirectUri: `${ISSUER}/cb`, scopes: ['openid'], state: 's', codeChallenge: challenge })
    const res = await fetch(url, { redirect: 'manual' })
    assert.oneOf(res.status, [302, 303])
    assert.include(res.headers.get('location') ?? '', '/interaction/')
  })

  test('resolver do client encontra o jwks_uri do server via discovery', async ({ assert }) => {
    const disco = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json()
    assert.isString(disco.jwks_uri)
    const factory = resolvers.jwt({ jwksUri: disco.jwks_uri })
    const resolver = await factory.resolver({ issuer: ISSUER, clientId: 'app1', sessionKey: 'authkit', globalRolesClaim: 'roles' })
    assert.isOk(resolver)
  })
})
