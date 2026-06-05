import { test } from '@japa/runner'
import { createAuthkit } from '../index.js'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Fake account store + audit sink behind a fake `authkit.server` (OidcService).
 * The embedded driver only touches `service.config` (accountStore/audit/patStore)
 * and `service.provider`, plus instantiates the server admin services — which in
 * turn read `cfg.accountStore`. So a minimal in-memory store is enough.
 */
function buildFakeServer() {
  const accounts = new Map<string, any>()
  accounts.set('u1', {
    id: 'u1',
    email: 'a@b.com',
    name: 'Ana',
    avatarUrl: null,
    globalRoles: ['ADMIN'],
  })
  const audit: any[] = []
  const disabled = new Set<string>()

  const accountStore = {
    async listAccounts({ page, limit }: any) {
      const data = [...accounts.values()]
      return { data, total: data.length, page, limit }
    },
    async findById(id: string) {
      return accounts.get(id) ?? null
    },
    async findByEmail(email: string) {
      return [...accounts.values()].find((a) => a.email === email) ?? null
    },
    async create(input: any) {
      const id = `u${accounts.size + 1}`
      const acc = { id, email: input.email, name: input.fullName ?? null, avatarUrl: null, globalRoles: [] }
      accounts.set(id, acc)
      return acc
    },
    async setGlobalRoles(id: string, roles: string[]) {
      accounts.get(id).globalRoles = roles
    },
    // account-status capability
    async disableAccount(id: string) {
      disabled.add(id)
    },
    async enableAccount(id: string) {
      disabled.delete(id)
    },
    async isDisabled(id: string) {
      return disabled.has(id)
    },
    async issuePasswordResetToken() {
      return { token: 'reset-tok' }
    },
  }

  const config = {
    accountStore,
    patStore: {
      async findActiveByToken(token: string) {
        if (token !== 'pat_good') return null
        return { accountId: 'u1', scopes: ['read'], audience: null, exp: 123 }
      },
    },
    audit: {
      async record(e: any) {
        audit.push(e)
      },
    },
    mail: { onPasswordReset: async () => {} },
  }

  const service = {
    config,
    provider: { AccessToken: { find: async () => null } },
  }
  return { service, audit, accounts }
}

function fakeApp(server: any): ApplicationService {
  return {
    container: {
      async make(binding: string) {
        if (binding === 'authkit.server') return server
        throw new Error(`unexpected binding ${binding}`)
      },
    },
    config: {
      get: (key: string, fallback?: any) =>
        key === 'authkit.issuer' ? 'https://idp.example.com' : fallback,
    },
  } as unknown as ApplicationService
}

test.group('embedded driver — same interface, same shapes', () => {
  test('users.list returns the user DTO shape', async ({ assert }) => {
    const { service } = buildFakeServer()
    const sdk = await createAuthkit({ mode: 'embedded', app: fakeApp(service) })
    const res = await sdk.users.list()
    assert.equal(res.total, 1)
    assert.deepEqual(Object.keys(res.data[0]).sort(), [
      'avatarUrl',
      'disabled',
      'email',
      'globalRoles',
      'id',
      'name',
    ])
    assert.equal(res.data[0].id, 'u1')
    assert.isFalse(res.data[0].disabled)
  })

  test('users.get throws when missing', async ({ assert }) => {
    const { service } = buildFakeServer()
    const sdk = await createAuthkit({ mode: 'embedded', app: fakeApp(service) })
    await assert.rejects(() => sdk.users.get('nope'))
  })

  test('users.create audits and returns invited', async ({ assert }) => {
    const { service, audit } = buildFakeServer()
    const sdk = await createAuthkit({ mode: 'embedded', app: fakeApp(service) })
    const res = await sdk.users.create({ email: 'new@b.com', invite: true })
    assert.isTrue(res.invited)
    assert.equal(res.email, 'new@b.com')
    assert.isTrue(audit.some((e) => e.type === 'user.created' && e.metadata.actor === 'admin-api'))
  })

  test('users.disable / enable flips status', async ({ assert }) => {
    const { service } = buildFakeServer()
    const sdk = await createAuthkit({ mode: 'embedded', app: fakeApp(service) })
    const d = await sdk.users.disable('u1')
    assert.isTrue(d.disabled)
    assert.isTrue((await sdk.users.get('u1')).disabled)
    const e = await sdk.users.enable('u1')
    assert.isFalse(e.disabled)
  })

  test('tokens.verify resolves a PAT to the same shape', async ({ assert }) => {
    const { service } = buildFakeServer()
    const sdk = await createAuthkit({ mode: 'embedded', app: fakeApp(service) })
    const res = await sdk.tokens.verify('pat_good')
    assert.isTrue(res.active)
    if (res.active) {
      assert.equal(res.tokenType, 'pat')
      assert.equal(res.sub, 'u1')
      assert.deepEqual(res.scopes, ['read'])
    }
    const bad = await sdk.tokens.verify('pat_bad')
    assert.isFalse(bad.active)
  })
})
