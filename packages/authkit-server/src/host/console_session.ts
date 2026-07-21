import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from './middleware/account_auth.js'
import { getAccountLoginUrl } from './account_login_url.js'

/**
 * Helpers públicos para integrar a sessão do console do AuthKit com
 * qualquer coisa fora do pacote (ex.: proteger o dashboard do
 * adonis-telescope, rotas administrativas próprias, etc).
 *
 * Use estes helpers em vez de ler `ctx.session` com a key interna —
 * eles são contrato público e continuam funcionando se o mecanismo de
 * sessão mudar.
 */

/**
 * Retorna o id da conta logada no console (ou `null` quando não há
 * sessão).
 */
export function getAccountId(ctx: HttpContext): string | null {
  const accountId = ctx.session?.get(ACCOUNT_SESSION_KEY) as string | undefined
  return accountId ?? null
}

/**
 * `true` quando o request carrega uma sessão de conta do console.
 */
export function hasAccountSession(ctx: HttpContext): boolean {
  return getAccountId(ctx) !== null
}

/**
 * URL do login do console, com `return_to` opcional de volta ao destino
 * original após autenticar.
 *
 * Respeita a opção `accountLoginUrl` de `registerAuthHost`: quando o host
 * desmontou a tela `account/login` e apontou para a própria rota de login
 * (ex.: `/login`), este helper usa esse destino. Default `/account/login`.
 *
 * @example
 * consoleLoginUrl('/telescope') // => '/account/login?return_to=%2Ftelescope'
 */
export function consoleLoginUrl(returnTo?: string): string {
  const loginUrl = getAccountLoginUrl()
  if (!returnTo) return loginUrl
  const sep = loginUrl.includes('?') ? '&' : '?'
  return `${loginUrl}${sep}return_to=${encodeURIComponent(returnTo)}`
}
