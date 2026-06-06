import type { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_MESSAGES, type AuthMessages } from '../i18n.js'
import { renderEdgeView } from './edge_renderer.js'

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

/**
 * Opções do renderer Inertia/React.
 */
export interface InertiaRendererOptions {
  /**
   * Prefixo das páginas no diretório `inertia/pages/` do host.
   * Ex.: `'authkit'` → a view `login` mapeia para `inertia/pages/authkit/login.tsx`.
   */
  prefix: string

  /**
   * Lista de nomes de view que o host criou como páginas React (allowlist).
   *
   * Quando fornecida, **somente** as views listadas passam pelo Inertia; qualquer
   * outra view (não listada, ou prefixada com `admin/`) recai silenciosamente no
   * renderer Edge built-in da lib — sem erro 500.
   *
   * ### ⚠️ Atenção: sem `views`, qualquer tela nova da lib quebra hosts SSR
   *
   * Se `views` for omitido, o comportamento legado é preservado (todas as views
   * são enviadas ao Inertia) para compatibilidade retroativa. Nesse modo, qualquer
   * tela nova adicionada pela lib gerará um erro SSR no host ("Cannot read
   * properties of undefined (reading 'default')") porque o host não terá criado a
   * página React correspondente. **Recomenda-se sempre fornecer `views`** com
   * exatamente as páginas que o scaffold (`node ace configure`) gerou.
   *
   * ### Admin sempre usa Edge
   *
   * Views cujo nome começa com `admin/` **nunca** passam pelo Inertia,
   * independentemente de `views`. O console admin é o chrome da lib; tematização
   * futura é via branding/CSS injetado — não via componentes React do host.
   *
   * @example
   * // Gera `inertia/pages/authkit/<view>.tsx` para cada nome listado.
   * render: inertiaRenderer({
   *   prefix: 'authkit',
   *   views: [
   *     'login', 'consent', 'signup', 'forgot', 'reset',
   *     'verify-email', 'mfa-challenge',
   *     'account/login', 'account/tokens', 'account/mfa',
   *   ],
   * })
   */
  views?: string[]
}

/**
 * Renderer do seam para hosts Inertia/React.
 *
 * As páginas React vivem no host em `inertia/pages/<prefix>/<view>`.
 * Views `admin/*` são **sempre** renderizadas pelas Edge views built-in da lib
 * (o console admin é chrome da lib; tematização futura é via branding/CSS — não
 * via componentes React do host).
 *
 * Quando `views` é fornecido (allowlist), apenas as views listadas vão ao Inertia;
 * qualquer outra view recai no Edge renderer built-in sem erro.
 */
export function inertiaRenderer(opts: InertiaRendererOptions) {
  const allowed = opts.views ? new Set(opts.views) : null

  return async (ctx: HttpContext, view: string, props: Record<string, unknown>) => {
    // Regra 1 — Admin sempre Edge: o console admin é chrome da lib.
    // Tematização futura é via branding/CSS injetado, não via componentes React do host.
    if (view.startsWith('admin/')) {
      return renderEdgeView(ctx, view, props)
    }

    // Regra 2 — Allowlist: se `views` foi fornecido e a view não está na lista,
    // usa o fallback Edge silenciosamente (evita SSR crash por página inexistente no host).
    if (allowed !== null && !allowed.has(view)) {
      return renderEdgeView(ctx, view, props)
    }

    // Happy path: view vai ao Inertia.
    // `messages` vai como shared prop para as páginas React traduzirem.
    const messages = await resolveMessagesFromCtx(ctx)
    return (ctx as any).inertia.render(`${opts.prefix}/${view}`, { ...props, messages })
  }
}
