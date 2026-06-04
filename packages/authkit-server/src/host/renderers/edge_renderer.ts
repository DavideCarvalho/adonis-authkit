import type { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_MESSAGES, translate, type AuthMessages } from '../i18n.js'

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

/** Renderer do seam para hosts Edge. As views são donas-da-lib (disco `authkit::`). */
export function edgeRenderer() {
  return async (ctx: HttpContext, view: string, props: Record<string, unknown>) => {
    const messages = await resolveMessagesFromCtx(ctx)
    // Helper `t` exposto às views: `{{ t('login.title') }}` ou
    // `{{ t('login.greeting', { name: account.fullName }) }}`.
    const t = (key: string, params?: Record<string, string | number>) =>
      translate(messages, key, params)
    return (ctx as any).view.render(`authkit::${view}`, { ...props, t, messages })
  }
}
