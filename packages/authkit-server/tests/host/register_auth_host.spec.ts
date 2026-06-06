import { test } from '@japa/runner'
import { registerAuthHost } from '../../src/host/register_auth_host.js'
import {
  getAdminPrefix,
  normalizeAdminPrefix,
  getAdminApiPrefix,
  normalizeAdminApiPrefix,
  setAdminUiMode,
} from '../../src/host/admin_prefix.js'

function fakeRouter() {
  const routes: Array<{
    method: string
    pattern: string
    middleware: unknown[]
    handler?: unknown
    name?: string
  }> = []
  let groupMiddlewareApplied = false
  /** Last prefix passed via `.prefix()` on any group chain — useful for API prefix tests. */
  const groupPrefixes: string[] = []

  const mk = (method: string) => (pattern: string, handler?: unknown) => {
    const route = {
      method,
      pattern,
      middleware: [] as unknown[],
      handler,
      name: undefined as string | undefined,
    }
    routes.push(route)
    const chain: any = {
      as: (n: string) => {
        route.name = n
        return chain
      },
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
    prefix: (p: string) => {
      groupPrefixes.push(p)
      return groupChain
    },
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
    patch: mk('PATCH'),
    delete: mk('DELETE'),
    put: mk('PUT'),
    any: mk('ANY'),
    group: (cb: () => void) => {
      cb()
      return groupChain
    },
    routes,
    get groupMiddlewareApplied() {
      return groupMiddlewareApplied
    },
    get groupPrefixes() {
      return groupPrefixes
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

  test('console React: rotas /api/* são registradas ANTES do catch-all do shell (anti-shadowing)', ({
    assert,
  }) => {
    // Regressão: o AdonisJS casa wildcards por ordem de registro. Se o catch-all
    // `${ap}/*` (shell HTML) vier antes das rotas `/api/*`, ele engole a API e
    // devolve HTML onde a SPA espera JSON ("Unexpected token '<'" no console).
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: { ui: 'react', prefix: '/admin' } })

    const idxCatchAll = (router.routes as any[]).findIndex(
      (r) => r.method === 'GET' && r.pattern === '/admin/*'
    )
    const apiGets = (router.routes as any[]).filter(
      (r) => r.method === 'GET' && r.pattern.startsWith('/admin/api/')
    )
    assert.isAbove(idxCatchAll, -1, 'catch-all do shell deve existir')
    assert.isAbove(apiGets.length, 0, 'deve haver rotas /api/*')
    for (const api of apiGets) {
      const idx = (router.routes as any[]).indexOf(api)
      assert.isBelow(idx, idxCatchAll, `${api.pattern} deve vir antes do catch-all /admin/*`)
    }
  })

  test('console React: rotas com mesmo controller.método têm nomes explícitos distintos (anti-colisão)', ({
    assert,
  }) => {
    // Regressão: o AdonisJS auto-deriva o nome da rota de controller.método. Duas
    // rotas GET no mesmo [controller, método] (shell em `ap` e `ap/*`) sem `.as()`
    // distinto colidem no boot ("route name already exists") — derrubou o deploy.
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: { ui: 'react' } })

    // Agrupa por handler-tuple (controller thunk + método); cada grupo com >1 rota
    // PRECISA de nomes explícitos e distintos.
    const byHandler = new Map<string, Array<{ name?: string }>>()
    for (const r of router.routes as any[]) {
      if (!Array.isArray(r.handler)) continue
      const key = JSON.stringify([String(r.handler[0]), r.handler[1], r.method])
      const list = byHandler.get(key) ?? []
      list.push(r)
      byHandler.set(key, list)
    }
    for (const [, list] of byHandler) {
      if (list.length < 2) continue
      const names = list.map((r) => r.name)
      assert.isTrue(
        names.every((n) => typeof n === 'string' && n.length > 0),
        'rotas que compartilham controller.método precisam de .as() explícito'
      )
      assert.equal(new Set(names).size, names.length, 'nomes de rota devem ser únicos')
    }
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

  test('monta o grupo /admin quando admin: true (React SPA — novo default)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: true })
    // admin:true usa ui:'react' — monta shell + JSON API.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin'))
    // Shell catch-all.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/*' && r.method === 'GET'))
    // JSON API overview.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/api/overview'))
    // JSON API users.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/api/users'))
    // JSON API clients.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/api/clients'))
    // JSON API audit.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/api/audit'))
    // NÃO monta rotas Edge antigas.
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/users' && r.method === 'GET'))
    // O grupo recebeu middleware (adminGuard).
    assert.isTrue(router.groupMiddlewareApplied)
    // O singleton de processo reflete o prefixo default.
    assert.equal(getAdminPrefix(), '/admin')
  })

  test('monta rotas Edge quando admin: { ui: edge }', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: { ui: 'edge' } })
    // Modo Edge: monta as rotas clássicas.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/users'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/users/:id/roles'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/clients'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/audit'))
    // NÃO monta rotas React.
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/*' && r.method === 'GET'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/api/overview'))
    assert.isTrue(router.groupMiddlewareApplied)
    assert.equal(getAdminPrefix(), '/admin')
    // Restaura modo react para não afetar outros testes.
    setAdminUiMode('react')
  })

  test('monta o grupo sob prefixo custom quando admin: { prefix }', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: { prefix: '/auth/admin' } })
    // Rotas React devem existir sob o prefixo custom.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/*'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/api/overview'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/api/users'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/api/clients'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/api/audit'))
    // As rotas do prefixo DEFAULT /admin NÃO devem existir.
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin/users'))
    // O singleton reflete o prefixo custom.
    assert.equal(getAdminPrefix(), '/auth/admin')
    // O grupo recebeu middleware (adminGuard).
    assert.isTrue(router.groupMiddlewareApplied)
  })

  test('admin: {} sem prefix usa o default /admin (React mode)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', admin: {} })
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/admin/api/users'))
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

test.group('registerAuthHost — Admin REST API prefix', () => {
  test('NÃO monta rotas da Admin API por default (opt-in)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc' })
    // Rotas internas do grupo (sem prefixo aplicado pelo fakeRouter) não devem existir.
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/users'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/clients'))
  })

  test('adminApi: true → prefixo default /api/authkit/v1 (back-compat)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', adminApi: true })
    // Grupo montado — rotas internas presentes.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/users' && r.method === 'GET'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/clients' && r.method === 'GET'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/audit' && r.method === 'GET'))
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/stats' && r.method === 'GET'))
    // Prefixo default aplicado ao grupo.
    assert.isTrue(router.groupPrefixes.includes('/api/authkit/v1'))
    // Singleton de processo reflete o prefixo default.
    assert.equal(getAdminApiPrefix(), '/api/authkit/v1')
    // Middleware (adminApiGuard) aplicado ao grupo.
    assert.isTrue(router.groupMiddlewareApplied)
  })

  test('adminApi: { prefix } → prefixo custom', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', adminApi: { prefix: '/authkit/api' } })
    // Grupo montado — rotas internas presentes.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/users' && r.method === 'GET'))
    // Prefixo custom aplicado ao grupo.
    assert.isTrue(router.groupPrefixes.includes('/authkit/api'))
    // Default NÃO aplicado.
    assert.isFalse(router.groupPrefixes.includes('/api/authkit/v1'))
    // Singleton reflete o prefixo custom.
    assert.equal(getAdminApiPrefix(), '/authkit/api')
  })

  test('adminApi: {} sem prefix usa o default /api/authkit/v1', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', adminApi: {} })
    assert.isTrue(router.groupPrefixes.includes('/api/authkit/v1'))
    assert.equal(getAdminApiPrefix(), '/api/authkit/v1')
  })

  test('adminApi prefix normalizado (sem trailing slash, com leading slash)', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, { mountPath: '/oidc', adminApi: { prefix: 'authkit/api/' } })
    assert.isTrue(router.groupPrefixes.includes('/authkit/api'))
    assert.equal(getAdminApiPrefix(), '/authkit/api')
  })

  test('normalizeAdminApiPrefix normaliza corretamente', ({ assert }) => {
    assert.equal(normalizeAdminApiPrefix('/api/authkit/v1'), '/api/authkit/v1')
    assert.equal(normalizeAdminApiPrefix('api/authkit/v1'), '/api/authkit/v1')
    assert.equal(normalizeAdminApiPrefix('/api/authkit/v1/'), '/api/authkit/v1')
    assert.equal(normalizeAdminApiPrefix('/authkit/api/'), '/authkit/api')
    assert.equal(normalizeAdminApiPrefix('  /authkit/api  '), '/authkit/api')
  })

  test('ambos os prefixos (console + API) custom convivem', ({ assert }) => {
    const router = fakeRouter()
    registerAuthHost(router, {
      mountPath: '/oidc',
      admin: { prefix: '/auth/admin' },
      adminApi: { prefix: '/authkit/api' },
    })
    // Console sob prefixo custom (modo React: rota shell + JSON API).
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin'))
    // Em modo React, as rotas de dados ficam sob /api/: /auth/admin/api/users.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/auth/admin/api/users'))
    assert.isFalse(router.routes.some((r: any) => r.pattern === '/admin'))
    // API grupo sob prefixo custom.
    assert.isTrue(router.routes.some((r: any) => r.pattern === '/users' && r.method === 'GET'))
    assert.isTrue(router.groupPrefixes.includes('/authkit/api'))
    assert.isFalse(router.groupPrefixes.includes('/api/authkit/v1'))
    // Singletons refletem ambos.
    assert.equal(getAdminPrefix(), '/auth/admin')
    assert.equal(getAdminApiPrefix(), '/authkit/api')
  })
})
