/**
 * Montagem das rotas dos métodos de sudo (`AuthHostOptions.sudoMethods`).
 *
 * Dois requisitos, os dois estruturais:
 *
 *  1. O host precisa conseguir MONTAR um método que não seja built-in. Sem
 *     isso, `config.sudo.methods` oferece na tela uma opção cujo endpoint dá
 *     404 — e `magicLink()` não é alcançável em runtime de jeito nenhum.
 *  2. Todo handler montado por um método é BARRADO por `config.sudo.methods`
 *     mesmo que o método NÃO tenha chamado `isSudoMethodEnabled`. A garantia
 *     tem de vir do ponto de registro; depender de o autor do método lembrar
 *     de checar é justamente o que reabriria a falha Critical.
 */

import { test } from '@japa/runner'
import { RouterFactory } from '@adonisjs/core/factories/http'
import { registerAuthHost } from '../../src/host/register_auth_host.js'
import { guardSudoRoutes, completeSudo, fail } from '../../src/host/sudo/runtime.js'
import { sudoContextFrom } from '../../src/host/sudo/index.js'
import { password } from '../../src/host/sudo/methods/password.js'
import { SUDO_SESSION_KEY } from '../../src/host/sudo_mode.js'
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js'
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js'
import type { SudoMethod, SudoRouteHelpers } from '../../src/host/sudo/types.js'
import type { Router } from '@adonisjs/core/http'

const ACCOUNT = { id: 'acc-1', email: 'user@example.com' }

/** Router falso que GUARDA os handlers, para podermos invocá-los. */
function capturingRouter() {
  const routes = new Map<string, (ctx: any) => Promise<unknown>>()
  const chain: any = { as: () => chain, middleware: () => chain, use: () => chain, prefix: () => chain }
  const mk = (verb: string) => (pattern: string, handler: any) => {
    if (typeof handler === 'function') routes.set(`${verb} ${pattern}`, handler)
    return chain
  }
  return {
    get: mk('GET'),
    post: mk('POST'),
    patch: mk('PATCH'),
    put: mk('PUT'),
    delete: mk('DELETE'),
    any: mk('ANY'),
    group: (cb: () => void) => {
      cb()
      return chain
    },
    routes,
  } as any
}

function fakeCtx(cfgOverrides: Record<string, unknown> = {}) {
  const session: Record<string, unknown> = { [ACCOUNT_SESSION_KEY]: ACCOUNT.id }
  const flashed: Record<string, unknown> = {}
  const redirects: string[] = []

  const cfg = {
    messages: { ...DEFAULT_MESSAGES },
    accountStore: {
      async findById(id: string) {
        return id === ACCOUNT.id ? ACCOUNT : null
      },
    },
    audit: {
      records: [] as unknown[],
      async record(e: unknown) {
        ;(cfg.audit.records as unknown[]).push(e)
      },
    },
    ...cfgOverrides,
  } as any

  const ctx = {
    session: {
      get: (k: string) => session[k],
      put: (k: string, v: unknown) => {
        session[k] = v
      },
      forget: (k: string) => {
        delete session[k]
      },
      flash: (k: string, v: unknown) => {
        flashed[k] = v
      },
      flashMessages: { get: (k: string) => flashed[k] ?? null },
    },
    request: {
      method: () => 'POST',
      only: () => ({}),
      input: () => undefined,
      qs: () => ({}),
      ip: () => '203.0.113.1',
    },
    response: {
      redirect: (url: string) => {
        redirects.push(url)
        return { _redirect: url }
      },
      notFound: (body?: unknown) => ({ _notFound: body ?? null }),
    },
    containerResolver: { make: async () => ({ config: cfg }) },
  } as any

  return { ctx, cfg, session, flashed, redirects }
}

/**
 * Método customizado DESATENTO: concede sudo sem nunca consultar
 * `config.sudo.methods`. É exatamente o método que o review descreve — e o
 * ponto do teste é que ele fica seguro mesmo assim.
 */
function metodoDesatento(): SudoMethod {
  return {
    id: 'custom',
    async isAvailable() {
      return true
    },
    async describe() {
      return {
        labelKey: 'account.confirm.method.password',
        kind: 'action' as const,
        endpoint: '/account/confirm/custom',
      }
    },
    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm/custom', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        return h.completeSudo(c, 'custom')
      })
    },
  }
}

test.group('sudo — AuthHostOptions.sudoMethods monta métodos do host', () => {
  test('sem a opção, monta os defaults (password + passkey)', ({ assert }) => {
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc' })

    assert.isTrue(router.routes.has('POST /account/confirm'))
    assert.isTrue(router.routes.has('POST /account/confirm/passkey'))
    assert.isFalse(router.routes.has('POST /account/confirm/magic-link'))
  })

  test('com a opção, monta as rotas do método customizado', ({ assert }) => {
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [metodoDesatento()] })

    assert.isTrue(router.routes.has('POST /account/confirm/custom'))
    // A opção SUBSTITUI os defaults — é a lista do host, não um acréscimo.
    assert.isFalse(router.routes.has('POST /account/confirm/passkey'))
  })

  test('magicLink() vira alcançável em runtime quando o host o registra', async ({ assert }) => {
    const { magicLink } = await import('../../src/host/sudo/methods/magic_link.js')
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [magicLink()] })

    assert.isTrue(router.routes.has('POST /account/confirm/magic-link'))
    assert.isTrue(router.routes.has('GET /account/confirm/magic-link/:token'))
  })
})

test.group('sudo — a barreira de config.sudo.methods é do ponto de registro', () => {
  test('método que NÃO checa isSudoMethodEnabled ainda é barrado pela config', async ({ assert }) => {
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [metodoDesatento()] })

    // Host restringiu a `password`: o método 'custom' está fora.
    const h = fakeCtx({ sudo: { methods: [password()] } })
    await router.routes.get('POST /account/confirm/custom')!(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.lengthOf(h.cfg.audit.records, 0)
    // Recusa com a mesma coreografia de um erro comum — não vaza a config.
    assert.isNotNull(h.flashed.confirmError)
  })

  test('contraprova: com o método na config, o mesmo handler concede sudo', async ({ assert }) => {
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [metodoDesatento()] })

    const custom = metodoDesatento()
    const h = fakeCtx({ sudo: { methods: [custom] } })
    await router.routes.get('POST /account/confirm/custom')!(h.ctx)

    assert.isNumber(h.session[SUDO_SESSION_KEY])
    assert.lengthOf(h.cfg.audit.records, 1)
  })

  test('sem config explícita, o método montado continua valendo', async ({ assert }) => {
    const router = capturingRouter()
    registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [metodoDesatento()] })

    const h = fakeCtx()
    await router.routes.get('POST /account/confirm/custom')!(h.ctx)

    assert.isNumber(h.session[SUDO_SESSION_KEY])
  })
})

/**
 * O wrapper `guardSudoRoutes` contra o `Router` DE VERDADE.
 *
 * Este grupo NÃO pode usar `capturingRouter()`. Foi exatamente por isso que o
 * bug passou: o objeto literal não tem campos privados, então um Proxy sobre
 * ele funciona para tudo. O `Router` do Adonis é uma classe com `#app`,
 * `#globalMatchers` e `#pushToRoutes` — ler/chamar um membro com `this`
 * apontando para o Proxy lança `TypeError`, e um método customizado que
 * agrupasse suas rotas (`router.group(...).prefix('/sudo')`, uso legítimo do
 * tipo `Router` que `SudoMethod.register` declara receber) explodia NO BOOT.
 *
 * Os built-in escapavam só porque usam apenas `.post`/`.get`.
 */
test.group('sudo — guardSudoRoutes preserva a API do Router real', () => {
  const helpers = { contextFrom: sudoContextFrom, completeSudo, fail }
  const realRouter = () => new RouterFactory().create() as unknown as Router

  test('group/route/on/where/use atravessam o wrapper sem TypeError', ({ assert }) => {
    const wrapped = guardSudoRoutes(realRouter(), 'custom', helpers)
    const handler = async () => 'ok'

    // Cada um destes lançava `TypeError` antes do `bind`/do caso de `route`.
    assert.doesNotThrow(() => {
      wrapped.group(() => {
        wrapped.post('/account/confirm/custom', handler)
      }).prefix('/sudo')
    })
    assert.doesNotThrow(() => wrapped.route('/account/confirm/rt', ['POST'], handler))
    assert.doesNotThrow(() => wrapped.on('/account/confirm/on'))
    assert.doesNotThrow(() => wrapped.where('id', /^[0-9]+$/))
    assert.doesNotThrow(() => wrapped.use([]))
  })

  test('o retorno real do Router é preservado — .as() encadeia', ({ assert }) => {
    const wrapped = guardSudoRoutes(realRouter(), 'custom', helpers)
    const route = wrapped.post('/account/confirm/custom', async () => 'ok').as('custom.confirm')

    assert.equal(route.getName(), 'custom.confirm')
    assert.equal(route.getPattern(), '/account/confirm/custom')
  })

  test('rotas registradas por route() também recebem a barreira', async ({ assert }) => {
    const router = realRouter()
    const wrapped = guardSudoRoutes(router, 'custom', helpers)

    // `route()` tem o handler no TERCEIRO argumento. Enquanto ele não era um
    // caso próprio, embrulhar o SEGUNDO (a lista de métodos) era impossível e
    // a rota saía desguardada — bypass silencioso da barreira.
    const route = wrapped.route('/account/confirm/rt', ['POST'], async (ctx: any) => {
      const c = await helpers.contextFrom(ctx)
      return helpers.completeSudo(c, 'custom')
    })

    // Host restringiu a `password`: o método 'custom' está fora.
    const barrado = fakeCtx({ sudo: { methods: [password()] } })
    await (route.getHandler() as any)(barrado.ctx)

    assert.isUndefined(barrado.session[SUDO_SESSION_KEY])
    assert.lengthOf(barrado.cfg.audit.records, 0)
    assert.isNotNull(barrado.flashed.confirmError)

    // Contraprova: com o método na config, o MESMO handler concede sudo.
    const liberado = fakeCtx({ sudo: { methods: [{ id: 'custom' }] } })
    await (route.getHandler() as any)(liberado.ctx)

    assert.isNumber(liberado.session[SUDO_SESSION_KEY])
    assert.lengthOf(liberado.cfg.audit.records, 1)
  })

  test('handlers registrados dentro de um group() também recebem a barreira', async ({
    assert,
  }) => {
    const wrapped = guardSudoRoutes(realRouter(), 'custom', helpers)
    let route: any
    wrapped.group(() => {
      route = wrapped.post('/account/confirm/custom', async (ctx: any) => {
        const c = await helpers.contextFrom(ctx)
        return helpers.completeSudo(c, 'custom')
      })
    }).prefix('/sudo')

    const barrado = fakeCtx({ sudo: { methods: [password()] } })
    await route.getHandler()(barrado.ctx)

    assert.isUndefined(barrado.session[SUDO_SESSION_KEY])
    assert.isNotNull(barrado.flashed.confirmError)
  })
})
