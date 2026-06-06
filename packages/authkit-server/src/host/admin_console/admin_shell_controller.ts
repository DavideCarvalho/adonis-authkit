import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import { getAdminPrefix } from '../admin_prefix.js'

/**
 * Cached shell HTML. Null = not yet loaded. Loaded once per process.
 * The shell is a plain HTML file with `window.__AUTHKIT__` injected at serving time.
 */
let _shellHtml: string | null = null

async function loadShell(): Promise<string> {
  if (_shellHtml === null) {
    _shellHtml = await readFile(new URL('../ui/admin.html', import.meta.url), 'utf-8')
  }
  return _shellHtml
}

/**
 * Injeta `window.__AUTHKIT__` no HTML do shell React antes de <body> ou antes do
 * primeiro <div>, garantindo que a SPA leia a config antes de montar.
 *
 * O bloco é inserido logo após `<body>` (ou no início do body quando a tag não é
 * encontrada). Se a tag não estiver presente, prepend seguro na string.
 */
function injectConfig(html: string, config: Record<string, unknown>): string {
  const script = `<script>window.__AUTHKIT__=${JSON.stringify(config)};</script>`
  const bodyIdx = html.indexOf('<body')
  if (bodyIdx === -1) return script + html
  // Insere após o fechamento da tag <body ...>.
  const closeIdx = html.indexOf('>', bodyIdx)
  if (closeIdx === -1) return script + html
  return html.slice(0, closeIdx + 1) + script + html.slice(closeIdx + 1)
}

/**
 * Controla o serving do shell React do console admin. Chamado por TODAS as rotas
 * GET sob o prefixo admin quando o modo UI é `'react'`. Serve o HTML com
 * `window.__AUTHKIT__` injetado contendo:
 *
 * - `adminBase`    — prefixo do console (ex.: `/admin`)
 * - `csrfToken`   — token CSRF para submissões fetch mutating
 * - `locale`      — locale ativo (ex.: `'pt-BR'`)
 * - `messages`    — catálogo i18n completo (objeto chave→string)
 * - `currentUser` — `{ id, email, roles }` do admin logado
 * - `endpoints`   — mapa com a base da JSON API do console (`api: string`)
 */
export default class AdminShellController {
  async serve(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    // currentUser: lê a sessão e carrega a conta logada.
    const { ACCOUNT_SESSION_KEY } = await import('../middleware/account_auth.js')
    const accountId = ctx.session?.get(ACCOUNT_SESSION_KEY) as string | undefined
    let currentUser: { id: string; email: string; roles: string[] } | null = null
    if (accountId) {
      const account = await cfg.accountStore.findById(accountId)
      if (account) {
        currentUser = {
          id: account.id,
          email: account.email,
          roles: account.globalRoles ?? [],
        }
      }
    }

    const adminBase = getAdminPrefix()
    const authkitConfig = {
      adminBase,
      csrfToken: (ctx.request as any).csrfToken ?? null,
      locale: (cfg as any).locale ?? 'en',
      messages: cfg.messages ?? {},
      currentUser,
      endpoints: {
        api: `${adminBase}/api`,
      },
    }

    const rawHtml = await loadShell()
    const html = injectConfig(rawHtml, authkitConfig)
    ctx.response.type('text/html').send(html)
  }
}
