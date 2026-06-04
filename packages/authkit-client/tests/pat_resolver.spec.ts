import { test } from '@japa/runner'
import { PatResolver } from '../src/resolvers/pat_resolver.js'

function ctxWithBearer(token?: string) {
  return {
    request: { header: (n: string) => (n.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined) },
  } as any
}

test.group('PatResolver', () => {
  test('sem header Authorization → null', async ({ assert }) => {
    const r = new PatResolver({
      introspectionUrl: 'http://idp/authkit/pat/introspect',
      introspectionSecret: 'super-secret',
      fetchImpl: async () => ({ ok: true, json: async () => ({ active: false }) }) as any,
    })
    assert.isNull(await r.resolve(ctxWithBearer()))
  })

  test('token inativo → null', async ({ assert }) => {
    const r = new PatResolver({
      introspectionUrl: 'http://idp/authkit/pat/introspect',
      introspectionSecret: 'super-secret',
      fetchImpl: async () => ({ ok: true, json: async () => ({ active: false }) }) as any,
    })
    assert.isNull(await r.resolve(ctxWithBearer('pat_x')))
  })

  test('token ativo → Identity com sub/email/roles e envia Bearer <secret>', async ({ assert }) => {
    let capturedHeaders: Record<string, string> = {}
    const r = new PatResolver({
      introspectionUrl: 'http://idp/authkit/pat/introspect',
      introspectionSecret: 'super-secret',
      fetchImpl: async (_url, init) => {
        capturedHeaders = init.headers ?? {}
        return {
          ok: true,
          json: async () => ({ active: true, sub: 'u1', email: 'a@b.com', name: 'A', picture: 'http://img/u1.png', sid: 'sess-1', roles: ['ADMIN'], scopes: ['read'], exp: 0 }),
        } as any
      },
    })
    const id = await r.resolve(ctxWithBearer('pat_x'))
    assert.isNotNull(id)
    assert.equal(id!.userId, 'u1')
    assert.equal(id!.email, 'a@b.com')
    assert.deepEqual(id!.globalRoles, ['ADMIN'])
    // Alinhamento com o jwt resolver: picture→avatarUrl, sid→sessionId.
    assert.equal(id!.profile?.name, 'A')
    assert.equal(id!.profile?.avatarUrl, 'http://img/u1.png')
    assert.equal(id!.sessionId, 'sess-1')
    assert.equal(capturedHeaders['authorization'], 'Bearer super-secret')
  })

  test('header Bearer que não é pat_ → null (não chama introspecção)', async ({ assert }) => {
    let called = false
    const r = new PatResolver({
      introspectionUrl: 'http://idp/authkit/pat/introspect',
      introspectionSecret: 'super-secret',
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({ active: true }) } as any },
    })
    assert.isNull(await r.resolve(ctxWithBearer('eyJhbGc-um-jwt')))
    assert.isFalse(called)
  })
})
