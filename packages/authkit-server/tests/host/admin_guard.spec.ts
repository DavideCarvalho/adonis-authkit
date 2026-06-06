import { test } from '@japa/runner'
import { adminGuard } from '../../src/host/register_auth_host.js'

/**
 * Fake ctx mínimo para exercitar o adminGuard. `sessionUserId` controla a sessão;
 * `account` é o que o accountStore.findById resolve; `adminRoles` são as roles
 * permitidas pelo config; `requestUrl` simula o caminho atual (para return_to).
 * Captura o redirect e se o `next()` foi chamado.
 */
function fakeCtx(opts: {
  sessionUserId?: string
  account?: { id: string; email: string; globalRoles?: string[] } | null
  adminRoles?: string[]
  adminEnabled?: boolean
  requestUrl?: string
}) {
  const redirects: string[] = []
  let notFoundCalled = false
  const ctx = {
    session: { get: (_k: string) => opts.sessionUserId },
    request: {
      url: () => opts.requestUrl ?? '',
      parsedUrl: { search: '' },
    },
    response: {
      redirect: (to: string) => redirects.push(to),
      notFound: () => {
        notFoundCalled = true
      },
    },
    containerResolver: {
      make: async () => ({
        config: {
          admin: { enabled: opts.adminEnabled ?? true, roles: opts.adminRoles ?? ['ADMIN'] },
          accountStore: {
            findById: async (_id: string) => opts.account ?? null,
          },
        },
      }),
    },
  } as any
  return { ctx, redirects, notFound: () => notFoundCalled }
}

test.group('adminGuard', () => {
  test('sem sessão → redireciona para /account/login', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({})
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isFalse(nextCalled)
    assert.deepEqual(redirects, ['/account/login'])
  })

  test('sem sessão com URL atual → inclui return_to no redirect', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({ requestUrl: '/admin/users' })
    await adminGuard(ctx, async () => {})
    assert.lengthOf(redirects, 1)
    assert.include(redirects[0], '/account/login')
    assert.include(redirects[0], 'return_to=%2Fadmin%2Fusers')
  })

  test('sessão com role admin → chama next()', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({
      sessionUserId: 'u1',
      account: { id: 'u1', email: 'a@x.com', globalRoles: ['ADMIN'] },
    })
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isTrue(nextCalled)
    assert.lengthOf(redirects, 0)
  })

  test('sessão sem role admin → redireciona para /account/tokens', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({
      sessionUserId: 'u2',
      account: { id: 'u2', email: 'b@x.com', globalRoles: ['VIEWER'] },
    })
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isFalse(nextCalled)
    assert.deepEqual(redirects, ['/account/tokens'])
  })

  test('respeita roles customizadas do config', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({
      sessionUserId: 'u3',
      account: { id: 'u3', email: 'c@x.com', globalRoles: ['STAFF'] },
      adminRoles: ['STAFF', 'ROOT'],
    })
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isTrue(nextCalled)
    assert.lengthOf(redirects, 0)
  })

  test('admin.enabled:false → 404 mesmo com sessão admin (flag-drift safety net)', async ({
    assert,
  }) => {
    const { ctx, redirects, notFound } = fakeCtx({
      adminEnabled: false,
      sessionUserId: 'u1',
      account: { id: 'u1', email: 'a@x.com', globalRoles: ['ADMIN'] },
    })
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isFalse(nextCalled)
    assert.isTrue(notFound())
    assert.lengthOf(redirects, 0)
  })

  test('conta sem roles → rejeitado', async ({ assert }) => {
    const { ctx, redirects } = fakeCtx({
      sessionUserId: 'u4',
      account: { id: 'u4', email: 'd@x.com' },
    })
    let nextCalled = false
    await adminGuard(ctx, async () => {
      nextCalled = true
    })
    assert.isFalse(nextCalled)
    assert.deepEqual(redirects, ['/account/tokens'])
  })
})
