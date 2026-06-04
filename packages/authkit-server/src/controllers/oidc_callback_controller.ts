import type { HttpContext } from '@adonisjs/core/http'

/**
 * Delega a requisição Adonis ao handler do oidc-provider (`service.callback`),
 * que faz seu próprio roteamento e escreve direto na resposta Node.
 *
 * Quando o issuer tem um path (ex.: `/oidc`), o `service.callback` é um app Koa
 * com o provider MONTADO sob esse path via koa-mount (vide OidcService). Por isso
 * NÃO removemos o prefixo de `req.url`: o koa-mount cuida do mount e o provider
 * gera URLs de discovery/redirect já prefixadas (ex.: /oidc/auth, /oidc/jwks).
 *
 * Resolvemos a Promise no `finish`/`close` para impedir que o Adonis tente
 * tratar a resposta novamente.
 *
 * Body bridge: o bodyparser do AdonisJS consome o stream da requisição antes
 * de chegar aqui. O oidc-provider usa `raw-body` para ler o stream — como ele
 * já está esgotado, o provider cai no fallback `ctx.req.body || ctx.request.body`.
 * Populamos `req.body` com o payload já parseado pelo AdonisJS para que o
 * oidc-provider consiga ler os parâmetros do formulário (client_id, code, etc.).
 */
export default class OidcCallbackController {
  async handle(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const req = ctx.request.request as any
    const res = ctx.response.response

    // Repassa o body já parseado pelo AdonisJS para o req cru, pois o stream
    // foi consumido pelo bodyparser_middleware antes de chegar neste controller.
    req.body = ctx.request.all()

    return new Promise<void>((resolve) => {
      res.on('finish', resolve)
      res.on('close', resolve)
      service.callback(req, res)
    })
  }
}
