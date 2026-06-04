import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { createServer, type Server } from 'node:http'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { OidcService } from '../src/provider/oidc_service.js'
import { fakeAccountStore } from './bootstrap.js'

const PORT = 9790
const ISSUER = `http://localhost:${PORT}`
const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

function decodeJwtPayload(jwt: string) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
}

test.group('token-exchange (impersonation)', (group) => {
  let server: Server
  let service: OidcService
  const auditEvents: any[] = []

  group.setup(async () => {
    const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: ISSUER,
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256' },
        clients: [
          {
            clientId: 'app1',
            clientSecret: 's',
            redirectUris: [`${ISSUER}/cb`],
            grants: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE],
          },
        ],
        audit: { record: async (e) => { auditEvents.push(e) } },
        accountStore: fakeAccountStore({
          findById: async (sub) => {
            if (sub === 'admin-1') return { id: sub, email: 'admin@x.com', globalRoles: ['ADMIN'], name: 'Admin' }
            if (sub === 'user-1') return { id: sub, email: 'u@x.com', globalRoles: ['USER'], name: 'User' }
            if (sub === 'target-1') return { id: sub, email: 't@x.com', globalRoles: ['USER'], name: 'Target' }
            return null
          },
        }),
      })
    )
    service = new OidcService(cfg!, 'a'.repeat(32))
    server = createServer(service.callback)
    await new Promise<void>((r) => server.listen(PORT, r))
    return async () => new Promise<void>((r) => server.close(() => r()))
  })

  async function mintSubjectToken(accountId: string): Promise<string> {
    const provider = (service as any).provider
    const client = await provider.Client.find('app1')
    const at = new provider.AccessToken({ accountId, client, scope: 'openid profile email' })
    return at.save()
  }

  function tokenRequest(params: Record<string, string>) {
    return fetch(`${ISSUER}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: 'Basic ' + Buffer.from('app1:s').toString('base64'),
      },
      body: new URLSearchParams(params).toString(),
    })
  }

  test('admin troca por alvo → id_token com sub=alvo e act={sub:admin}', async ({ assert }) => {
    const subjectToken = await mintSubjectToken('admin-1')
    const res = await tokenRequest({
      grant_type: TOKEN_EXCHANGE,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_subject: 'target-1',
      scope: 'openid profile email',
    })
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.isString(json.access_token)
    assert.isString(json.id_token)
    const payload = decodeJwtPayload(json.id_token)
    assert.equal(payload.sub, 'target-1')
    assert.equal(payload.email, 't@x.com')
    assert.deepEqual(payload.act, { sub: 'admin-1' })

    // Audita o evento de impersonation (actor=admin, account=alvo).
    const imp = auditEvents.find((e) => e.type === 'impersonation')
    assert.exists(imp)
    assert.equal(imp.actorId, 'admin-1')
    assert.equal(imp.accountId, 'target-1')
    assert.equal(imp.clientId, 'app1')
  })

  test('ator não-admin → invalid_grant (negado)', async ({ assert }) => {
    const subjectToken = await mintSubjectToken('user-1')
    const res = await tokenRequest({
      grant_type: TOKEN_EXCHANGE,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_subject: 'target-1',
    })
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.error, 'invalid_grant')
  })

  test('requested_subject ausente → erro', async ({ assert }) => {
    const subjectToken = await mintSubjectToken('admin-1')
    const res = await tokenRequest({
      grant_type: TOKEN_EXCHANGE,
      subject_token: subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
    })
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.error, 'invalid_request')
  })

  test('subject_token inválido → invalid_grant', async ({ assert }) => {
    const res = await tokenRequest({
      grant_type: TOKEN_EXCHANGE,
      subject_token: 'nao-existe',
      subject_token_type: ACCESS_TOKEN_TYPE,
      requested_subject: 'target-1',
    })
    assert.equal(res.status, 400)
    const json = await res.json()
    assert.equal(json.error, 'invalid_grant')
  })
})
