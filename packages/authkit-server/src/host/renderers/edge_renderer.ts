import type { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_MESSAGES, translate, type AuthMessages } from '../i18n.js'
import { getAccountLoginUrl } from '../account_login_url.js'

/**
 * Resolve o catálogo de mensagens ativo a partir do `authkit.server` (config
 * resolvida com o locale do host). Defensivo: se o container/serviço não estiver
 * disponível (ex.: teste unitário do renderer com ctx mockado), cai no default
 * pt-BR embutido — as views continuam renderizando.
 */
async function resolveMessagesFromCtx(ctx: HttpContext): Promise<AuthMessages> {
  try {
    const service = await (ctx as any).containerResolver?.make?.('authkit.server')
    const messages = service?.config?.messages as AuthMessages | undefined
    if (messages) return messages
  } catch {
    // sem container/serviço — usa o default
  }
  return { ...DEFAULT_MESSAGES }
}

/**
 * Função low-level que renderiza uma view Edge built-in da lib sem criar um
 * closure. Usada internamente pelo `edgeRenderer()` e pelo `inertiaRenderer()`
 * como fallback silencioso para views não listadas no allowlist (incluindo todas
 * as telas `admin/*`).
 *
 * @internal Exportada para reuso — não faz parte da API pública do seam.
 */
export async function renderEdgeView(
  ctx: HttpContext,
  view: string,
  props: Record<string, unknown>
): Promise<unknown> {
  const messages = await resolveMessagesFromCtx(ctx)
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(messages, key, params)
  // `loginUrl` como prop global: as views que linkam "faça login" (ex.: `otp-unlock`)
  // usam o destino configurável (`accountLoginUrl`) em vez do `/account/login` fixo,
  // que pode estar desmontado. Props explícitas ainda têm precedência (spread depois).
  const loginUrl = getAccountLoginUrl()
  return (ctx as any).view.render(`authkit::${view}`, { loginUrl, ...props, t, messages })
}

/** Renderer do seam para hosts Edge. As views são donas-da-lib (disco `authkit::`). */
export function edgeRenderer() {
  return async (ctx: HttpContext, view: string, props: Record<string, unknown>) => {
    return renderEdgeView(ctx, view, props)
  }
}
