import { test } from '@japa/runner'
import { Authenticator } from '../src/authenticator.js'
import type { Identity } from '@dudousxd/adonis-authkit-core'

const identity: Identity = {
  userId: 'u1', email: 'a@b.com', globalRoles: ['ADMIN'], profile: { name: 'Ana' },
  issuedAt: 0, expiresAt: 0, raw: {},
}

test.group('Authenticator', () => {
  test('identity é memoizada (resolve uma vez)', async ({ assert }) => {
    let calls = 0
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => { calls++; return identity } } as any,
      resolveUser: async () => ({ id: 'u1', name: 'app user' }),
      resolveAppRoles: async () => ['COORDINATOR'],
    })
    assert.equal((await auth.getIdentity())!.userId, 'u1')
    await auth.getIdentity()
    assert.equal(calls, 1)
  })

  test('hasGlobalRole lê das claims (sync após resolver)', async ({ assert }) => {
    const auth = new Authenticator({} as any, { resolver: { resolve: async () => identity } as any })
    await auth.authenticate()
    assert.isTrue(auth.hasGlobalRole('ADMIN'))
    assert.isFalse(auth.hasGlobalRole('STAFF'))
  })

  test('hasAppRole delega ao resolveAppRoles', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
      resolveAppRoles: async () => ['COORDINATOR'],
    })
    await auth.authenticate()
    assert.isTrue(await auth.hasAppRole('COORDINATOR'))
    assert.isFalse(await auth.hasAppRole('ADVISOR'))
  })

  test('getUser usa resolveUser e memoiza', async ({ assert }) => {
    let calls = 0
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
      resolveUser: async () => { calls++; return { id: 'u1' } },
    })
    await auth.getUser(); await auth.getUser()
    assert.equal(calls, 1)
  })

  test('authenticate lança quando não autenticado', async ({ assert }) => {
    const auth = new Authenticator({} as any, { resolver: { resolve: async () => null } as any })
    await assert.rejects(() => auth.authenticate())
    assert.isFalse(await auth.check())
  })
})
