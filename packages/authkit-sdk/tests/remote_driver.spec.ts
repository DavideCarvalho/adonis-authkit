import { test } from '@japa/runner'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createAuthkit, AuthkitApiError } from '../index.js'
import type { Authkit } from '../index.js'

interface Captured {
  method: string
  url: string
  authorization?: string
  body?: any
}

/** Spins a fake Admin API: records the request and replays a canned response. */
function fakeApi(handler: (req: Captured) => { status: number; body: unknown } | void) {
  let last: Captured | undefined
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const captured: Captured = {
        method: req.method ?? '',
        url: req.url ?? '',
        authorization: req.headers['authorization'] as string | undefined,
        body: raw ? JSON.parse(raw) : undefined,
      }
      last = captured
      const out = handler(captured) ?? { status: 200, body: {} }
      res.statusCode = out.status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(out.body))
    })
  })
  return {
    server,
    listen: () =>
      new Promise<string>((resolve) => {
        server.listen(0, () => {
          const addr = server.address()
          const port = typeof addr === 'object' && addr ? addr.port : 0
          resolve(`http://127.0.0.1:${port}`)
        })
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    get last() {
      return last
    },
  }
}

async function withApi(
  handler: Parameters<typeof fakeApi>[0],
  run: (sdk: Authkit, api: ReturnType<typeof fakeApi>) => Promise<void>
) {
  const api = fakeApi(handler)
  const baseUrl = await api.listen()
  try {
    const sdk = await createAuthkit({ mode: 'remote', baseUrl, apiKey: 'key-123' })
    await run(sdk, api)
  } finally {
    await api.close()
  }
}

test.group('remote driver — users', () => {
  test('list hits GET /users with query + Bearer key', async ({ assert }) => {
    await withApi(
      () => ({
        status: 200,
        body: {
          data: [{ id: 'u1', email: 'a@b.com', name: null, avatarUrl: null, globalRoles: [], disabled: false }],
          total: 1,
          page: 1,
          limit: 20,
        },
      }),
      async (sdk, api) => {
        const res = await sdk.users.list({ search: 'ana', page: 2 })
        assert.equal(res.total, 1)
        assert.equal(res.data[0].id, 'u1')
        assert.equal(api.last!.method, 'GET')
        assert.match(api.last!.url, /^\/api\/authkit\/v1\/users\?/)
        assert.match(api.last!.url, /search=ana/)
        assert.match(api.last!.url, /page=2/)
        assert.equal(api.last!.authorization, 'Bearer key-123')
      }
    )
  })

  test('create POSTs body and returns invited flag', async ({ assert }) => {
    await withApi(
      () => ({
        status: 201,
        body: {
          id: 'u2',
          email: 'new@b.com',
          name: 'New',
          avatarUrl: null,
          globalRoles: [],
          disabled: false,
          invited: true,
        },
      }),
      async (sdk, api) => {
        const res = await sdk.users.create({ email: 'new@b.com', name: 'New', invite: true })
        assert.equal(res.id, 'u2')
        assert.isTrue(res.invited)
        assert.equal(api.last!.method, 'POST')
        assert.equal(api.last!.url, '/api/authkit/v1/users')
        assert.deepEqual(api.last!.body, { email: 'new@b.com', name: 'New', invite: true })
      }
    )
  })

  test('delete uses DELETE verb and returns cascade counts', async ({ assert }) => {
    await withApi(
      () => ({
        status: 200,
        body: {
          id: 'u1',
          deleted: true,
          sessions: 1,
          grants: 2,
          accessTokens: 3,
          refreshTokens: 1,
          pats: 1,
          passkeys: 1,
          providerIdentities: 1,
          auditAnonymized: 5,
          avatarDeleted: true,
        },
      }),
      async (sdk, api) => {
        const res = await sdk.users.delete('u1')
        assert.isTrue(res.deleted)
        assert.equal(res.passkeys, 1)
        assert.equal(res.auditAnonymized, 5)
        assert.equal(api.last!.method, 'DELETE')
        assert.equal(api.last!.url, '/api/authkit/v1/users/u1')
      }
    )
  })
})

test.group('remote driver — error mapping', () => {
  test('401 maps to AuthkitApiError', async ({ assert }) => {
    await withApi(
      () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'API key inválida.' } } }),
      async (sdk) => {
        await assert.rejects(async () => {
          try {
            await sdk.users.list()
          } catch (e) {
            assert.instanceOf(e, AuthkitApiError)
            assert.equal((e as AuthkitApiError).status, 401)
            assert.equal((e as AuthkitApiError).code, 'unauthorized')
            throw e
          }
        })
      }
    )
  })

  test('404 maps to not_found', async ({ assert }) => {
    await withApi(
      () => ({ status: 404, body: { error: { code: 'not_found', message: 'Usuário não encontrado.' } } }),
      async (sdk) => {
        try {
          await sdk.users.get('missing')
          assert.fail('should have thrown')
        } catch (e) {
          assert.instanceOf(e, AuthkitApiError)
          assert.equal((e as AuthkitApiError).status, 404)
          assert.equal((e as AuthkitApiError).code, 'not_found')
        }
      }
    )
  })

  test('409 maps to conflict code', async ({ assert }) => {
    await withApi(
      () => ({ status: 409, body: { error: { code: 'email_taken', message: 'Já existe.' } } }),
      async (sdk) => {
        try {
          await sdk.users.create({ email: 'dup@b.com' })
          assert.fail('should have thrown')
        } catch (e) {
          assert.equal((e as AuthkitApiError).status, 409)
          assert.equal((e as AuthkitApiError).code, 'email_taken')
        }
      }
    )
  })

  test('network error wraps with network_error code', async ({ assert }) => {
    const sdk = await createAuthkit({ mode: 'remote', baseUrl: 'http://127.0.0.1:1', apiKey: 'k' })
    try {
      await sdk.users.list()
      assert.fail('should have thrown')
    } catch (e) {
      assert.instanceOf(e, AuthkitApiError)
      assert.equal((e as AuthkitApiError).code, 'network_error')
    }
  })
})

test.group('remote driver — clients + tokens', () => {
  test('create returns secret once', async ({ assert }) => {
    await withApi(
      () => ({ status: 201, body: { clientId: 'c1', clientSecret: 'sek' } }),
      async (sdk, api) => {
        const res = await sdk.clients.create({ redirectUris: ['https://x/cb'] })
        assert.equal(res.clientId, 'c1')
        assert.equal(res.clientSecret, 'sek')
        assert.equal(api.last!.url, '/api/authkit/v1/clients')
      }
    )
  })

  test('regenerateSecret hits the right path', async ({ assert }) => {
    await withApi(
      () => ({ status: 200, body: { clientId: 'c1', clientSecret: 'sek2' } }),
      async (sdk, api) => {
        const res = await sdk.clients.regenerateSecret('c1')
        assert.equal(res.clientSecret, 'sek2')
        assert.equal(api.last!.url, '/api/authkit/v1/clients/c1/regenerate-secret')
        assert.equal(api.last!.method, 'POST')
      }
    )
  })

  test('delete uses DELETE verb', async ({ assert }) => {
    await withApi(
      () => ({ status: 200, body: { clientId: 'c1', deleted: true } }),
      async (sdk, api) => {
        const res = await sdk.clients.delete('c1')
        assert.isTrue(res.deleted)
        assert.equal(api.last!.method, 'DELETE')
        assert.equal(api.last!.url, '/api/authkit/v1/clients/c1')
      }
    )
  })

  test('tokens.verify posts token and returns introspection', async ({ assert }) => {
    await withApi(
      () => ({ status: 200, body: { active: true, tokenType: 'pat', sub: 'u1', scopes: ['read'] } }),
      async (sdk, api) => {
        const res = await sdk.tokens.verify('pat_abc')
        assert.isTrue(res.active)
        if (res.active) assert.equal(res.tokenType, 'pat')
        assert.equal(api.last!.url, '/api/authkit/v1/tokens/verify')
        assert.deepEqual(api.last!.body, { token: 'pat_abc' })
      }
    )
  })
})
