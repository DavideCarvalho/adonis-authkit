import type { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_MESSAGES, type AuthMessages } from '../i18n.js'

/**
 * Resolve o catálogo de mensagens ativo a partir do `authkit.server`. Defensivo:
 * sem container/serviço (ex.: teste unitário com ctx mockado), cai no default
 * pt-BR embutido.
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

/** Renderer do seam para hosts Inertia/React. As páginas vivem no host em `inertia/pages/<prefix>/*`. */
export function inertiaRenderer(opts: { prefix: string }) {
  return async (ctx: HttpContext, view: string, props: Record<string, unknown>) => {
    // `messages` vai como shared prop para as páginas React traduzirem.
    const messages = await resolveMessagesFromCtx(ctx)
    return (ctx as any).inertia.render(`${opts.prefix}/${view}`, { ...props, messages })
  }
}
