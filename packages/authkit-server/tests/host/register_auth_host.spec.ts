import { test } from '@japa/runner'
import { registerAuthHost } from '../../src/host/register_auth_host.js'
import { getAdminPrefix, normalizeAdminPrefix } from '../../src/host/admin_prefix.js'

function fakeRouter() {
  const routes: Array<{ method: string; pattern: string; middleware: unknown[] }> = []
  let groupMiddlewareApplied = false

  const mk = (method: string) => (pattern: string) => {
    const route = { method, pattern, middleware: [] as unknown[] }
    routes.push(route)
    const chain: any = {
      as: () => chain,
      middleware: () => chain,
      use: (m: unknown[]) => {
        route.middleware.push(...(Array.isArray(m) ? m : [m]))
        return chain
      },
    }
    return chain
  }

  const groupChain = {
    as: () => groupChain,
    prefix: () => groupChain,
    middleware: (..._args: any[]) => {
      groupMiddlewareApplied = true
      return groupChain
    },
    use: (..._args: any[]) => {
      groupMiddlewareApplied = true
      return groupChain
    },
  }

  const router: any = {
    get: mk('GET'),
    post: mk('POST'),
    any: mk('ANY'),
    group: (cb: () => void) => {
      cb()
      return groupChain
    },
    routes,
    get groupMiddlewareApplied() {
      return groupMiddlewareApplied
    },
  }
  return router
}

test.group('registerAuthHost', () => {
  test('monta o wildcard do provider sob mountPath + a interaction', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/oidc/*'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/oidc'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/interaction/:uid'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/account/login'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/authkit/pat/introspect'))
  })

  test('NÃO monta rotas sociais quando social ausente', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })
    assert.isFalse(router.routes.some((r: any) => r.pattern.includes('/redirect/:uid')))
  })

  test('monta rotas sociais quando social definido', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', social: { providers: ['google'] } })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/:provider/redirect/:uid'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/:provider/callback'))
  })

  test('usa o mountPath custom', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/sso' })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/sso/*'))
  })

  test('protege as rotas /account/tokens com middleware (login/logout ficam livres)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })

    // As 3 rotas de tokens existem
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/account/tokens'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/account/tokens/:id/revoke'))

    // O middleware account_auth foi aplicado ao grupo
    assert.isTrue(router.groupMiddlewareApplied)

    // login/logout continuam registradas fora do grupo protegido
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/account/login'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/account/logout'))
  })

  test('NÃO monta rotas /admin por default (opt-in)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/users'))
  })

  test('monta o grupo /admin quando admin: true (back-compat)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: true })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/users'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/users/:id/roles'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/clients'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/audit'))
    // O grupo recebeu middleware (adminGuard).
    assert.isTrue(router.groupMiddlewareApplied)
    // O singleton de processo reflete o prefixo default.
    assert.equal(getAdminPrefix(), '/admin')
  })

  test('monta o grupo sob prefixo custom quando admin: { prefix }', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: { prefix: '/auth/admin' } })
    // Rotas devem existir sob o prefixo custom.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/users'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/users/:id/roles'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/clients'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/audit'))
    // As rotas do prefixo DEFAULT /admin NÃO devem existir.
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/users'))
    // O singleton reflete o prefixo custom.
    assert.equal(getAdminPrefix(), '/auth/admin')
    // O grupo recebeu middleware (adminGuard).
    assert.isTrue(router.groupMiddlewareApplied)
  })

  test('admin: {} sem prefix usa o default /admin', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: {} })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/users'))
    assert.equal(getAdminPrefix(), '/admin')
  })

  test('normalizeAdminPrefix normaliza corretamente', ({ assert }) => {
    assert.equal(normalizeAdminPrefix('/admin'), '/admin')
    assert.equal(normalizeAdminPrefix('admin'), '/admin')
    assert.equal(normalizeAdminPrefix('/admin/'), '/admin')
    assert.equal(normalizeAdminPrefix('/auth/admin/'), '/auth/admin')
    assert.equal(normalizeAdminPrefix('  /auth/admin  '), '/auth/admin')
  })

  test('NÃO aplica throttle quando rateLimit enabled: false explícito', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', rateLimit: { enabled: false } })

    const loginRoute = router.routes.find(
      (r: any) => r.pattern === '/auth/interaction/:uid/login'
    )
    const introspectRoute = router.routes.find(
      (r: any) => r.pattern === '/authkit/pat/introspect'
    )
    assert.lengthOf(loginRoute.middleware, 0)
    assert.lengthOf(introspectRoute.middleware, 0)
  })

  test('aplica throttle por default (sem rateLimit passado)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })

    const loginRoute = router.routes.find(
      (r: any) => r.pattern === '/auth/interaction/:uid/login' && r.method === 'POST'
    )
    const introspectRoute = router.routes.find(
      (r: any) => r.pattern === '/authkit/pat/introspect'
    )
    assert.isAbove(loginRoute.middleware.length, 0)
    assert.isAbove(introspectRoute.middleware.length, 0)
  })

  test('aplica throttle nas rotas sensíveis quando rateLimit enabled', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', rateLimit: { enabled: true } })

    // Login bucket: login/signup/forgot/reset POSTs recebem throttle.
    const loginBucketPatterns = [
      '/auth/interaction/:uid/login',
      '/auth/interaction/:uid/signup',
      '/auth/forgot-password',
      '/auth/reset-password',
    ]
    for (const pattern of loginBucketPatterns) {
      const route = router.routes.find((r: any) => r.pattern === pattern && r.method === 'POST')
      assert.isAbove(route.middleware.length, 0, `esperava throttle em ${pattern}`)
    }

    // Introspection bucket.
    const introspectRoute = router.routes.find(
      (r: any) => r.pattern === '/authkit/pat/introspect'
    )
    assert.isAbove(introspectRoute.middleware.length, 0)

    // Rotas não-sensíveis (GETs, consent, identifier) NÃO recebem throttle.
    const consentRoute = router.routes.find(
      (r: any) => r.pattern === '/auth/interaction/:uid/consent'
    )
    assert.lengthOf(consentRoute.middleware, 0)
    const showRoute = router.routes.find(
      (r: any) => r.pattern === '/auth/interaction/:uid' && r.method === 'GET'
    )
    assert.lengthOf(showRoute.middleware, 0)
  })
})
