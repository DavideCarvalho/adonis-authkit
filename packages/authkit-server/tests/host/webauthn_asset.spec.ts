import { test } from '@japa/runner'
import { existsSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import WebauthnAssetController, {
  resetWebauthnAssetCache,
} from '../../src/host/controllers/webauthn_asset_controller.js'
import { registerAuthHost } from '../../src/host/register_auth_host.js'
import { resetAuthHostConfig } from '../../src/host/auth_host_config.js'

const viewsDir = fileURLToPath(new URL('../../src/host/views/', import.meta.url))
const bundlePath = fileURLToPath(new URL('../../src/host/assets/webauthn.js', import.meta.url))

/** Path público do bundle — contrato entre a rota e as quatro views. */
const ASSET_PATH = '/authkit/assets/webauthn.js'

/**
 * Views que fazem o handshake WebAuthn. São exatamente as que importavam o
 * `@simplewebauthn/browser` de `cdn.jsdelivr.net`.
 */
const WEBAUTHN_VIEWS = ['login.edge', 'mfa-challenge.edge', 'account/mfa.edge', 'account/confirm.edge']

/** Todas as views da lib — o teste de anti-regressão de CDN varre o conjunto inteiro. */
function allViews(dir = viewsDir, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...allViews(dir + entry.name + '/', prefix + entry.name + '/'))
    else if (entry.name.endsWith('.edge')) out.push(prefix + entry.name)
  }
  return out
}

const read = (p: string) => readFileSync(viewsDir + p, 'utf8')

/**
 * `HttpContext` mínimo para exercitar o controller. Captura o que foi enviado
 * em vez de mockar o response inteiro do Adonis.
 */
function fakeCtx() {
  const captured: {
    type?: string
    headers: Record<string, string>
    body?: unknown
    status?: number
  } = { headers: {} }

  const response: any = {
    type(t: string) {
      captured.type = t
      return response
    },
    header(k: string, v: string) {
      captured.headers[k] = v
      return response
    },
    send(b: unknown) {
      captured.body = b
      return response
    },
    notFound(b?: unknown) {
      captured.status = 404
      captured.body = b
      return response
    },
  }

  return { ctx: { response } as any, captured }
}

test.group('webauthn asset (bundle npm, sem CDN)', (group) => {
  group.each.setup(() => {
    resetWebauthnAssetCache()
    return () => resetWebauthnAssetCache()
  })

  test('o bundle é gerado e commitado em src/host/assets/', ({ assert }) => {
    assert.isTrue(
      existsSync(bundlePath),
      'src/host/assets/webauthn.js não existe — rode `node scripts/build_webauthn.mjs`'
    )
    const code = readFileSync(bundlePath, 'utf8')
    // O contrato com as views: os dois símbolos que elas importam.
    assert.include(code, 'startAuthentication')
    assert.include(code, 'startRegistration')
    // Bundle de verdade, não um reexport que o browser tentaria resolver por
    // bare specifier (o browser não resolve node_modules).
    assert.notInclude(code, "from'@simplewebauthn/browser'")
    assert.notInclude(code, "from '@simplewebauthn/browser'")
  })

  test('serve o bundle com content-type text/javascript e cache imutável', async ({ assert }) => {
    const { ctx, captured } = fakeCtx()
    await new WebauthnAssetController().handle(ctx)

    assert.equal(captured.type, 'text/javascript')
    assert.equal(captured.headers['Cache-Control'], 'public, max-age=31536000, immutable')
    assert.isUndefined(captured.status, 'não deveria ter caído no 404')
    assert.isTrue(Buffer.isBuffer(captured.body))
    assert.include((captured.body as Buffer).toString('utf8'), 'startAuthentication')
  })

  test('responde 404 limpo quando o bundle não existe', async ({ assert }) => {
    // Exercita o caminho real (o `readFile` do próprio controller) escondendo o
    // arquivo, em vez de injetar um path falso: é o modo de falha de verdade
    // quando alguém publica sem rodar o build do bundle.
    const hidden = bundlePath + '.hidden-by-test'
    renameSync(bundlePath, hidden)
    try {
      resetWebauthnAssetCache()
      const { ctx, captured } = fakeCtx()
      await new WebauthnAssetController().handle(ctx)

      assert.equal(captured.status, 404)
      assert.isUndefined(captured.type, 'não deveria ter setado content-type')
      assert.isUndefined(captured.headers['Cache-Control'])
    } finally {
      renameSync(hidden, bundlePath)
      resetWebauthnAssetCache()
    }
  })

  test('a rota é pública, sem guard, e fora do prefixo do console admin', ({ assert }) => {
    resetAuthHostConfig()

    const routes: Array<{ method: string; pattern: string; middleware: unknown[]; name?: string }> = []
    const mk = (method: string) => (pattern: string, handler?: unknown) => {
      const route = { method, pattern, middleware: [] as unknown[], handler, name: undefined as any }
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
    const groupChain: any = {
      as: () => groupChain,
      prefix: () => groupChain,
      middleware: () => groupChain,
      use: () => groupChain,
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
    }

    // SEM `admin: true` — é justamente o caso que o CDN mascarava: um host sem
    // console admin precisa do script na tela de login do mesmo jeito.
    registerAuthHost(router)

    const route = routes.find((r) => r.pattern === ASSET_PATH)
    assert.isDefined(route, `rota ${ASSET_PATH} não registrada`)
    assert.equal(route!.method, 'GET')
    assert.lengthOf(route!.middleware, 0, 'o asset da tela de login não pode ter guard')

    // Registrada antes do wildcard do provider OIDC — senão um mountPath
    // agressivo engole o asset e o botão de passkey some sem aviso.
    const wildcard = routes.findIndex((r) => r.name === 'authkit.oidc.wildcard')
    assert.isBelow(routes.indexOf(route!), wildcard)
  })

  test('as views WebAuthn importam o bundle local', ({ assert }) => {
    for (const view of WEBAUTHN_VIEWS) {
      assert.include(read(view), ASSET_PATH, `${view} não importa ${ASSET_PATH}`)
    }
  })

  test('nenhuma view referencia domínio externo (anti-regressão de CDN)', ({ assert }) => {
    // Barato e específico: qualquer volta ao jsdelivr/unpkg/tailwind CDN quebra
    // aqui em vez de quebrar o login de quem roda com CSP `script-src 'self'`.
    const offenders: string[] = []
    for (const view of allViews()) {
      const src = read(view)
      for (const [i, line] of src.split('\n').entries()) {
        // Ignora comentários Edge (`{{-- … --}}`), que não vão para o HTML.
        if (line.includes('{{--')) continue

        /**
         * `xmlns="http://www.w3.org/2000/svg"` é um NAMESPACE XML, não um
         * fetch — o browser nunca vai à rede por causa dele. Sem esta limpeza
         * todo `<svg>` e todo data-URI do CSS gerado viram falso positivo e o
         * teste é desligado por ruído (que é como uma regressão volta).
         */
        const cleaned = line.replace(/xmlns(:\w+)?=(["'])[^"']*\2/g, '')

        const external =
          // <script src="https://…">, <link href="https://…">, <img src="…">
          /(?:src|href)\s*=\s*["']https?:\/\//i.test(cleaned) ||
          // import … from 'https://…'  /  await import('https://…')
          /\bfrom\s*["']https?:\/\/|\bimport\s*\(\s*["']https?:\/\//i.test(cleaned) ||
          // CDNs conhecidos em qualquer posição (inclui `//cdn.…` protocol-relative)
          /\/\/cdn\.|jsdelivr|unpkg\.com|cdnjs\./i.test(cleaned)

        if (external) offenders.push(`${view}:${i + 1}: ${line.trim().slice(0, 160)}`)
      }
    }
    assert.deepEqual(offenders, [], `views com referência externa:\n${offenders.join('\n')}`)
  })
})
