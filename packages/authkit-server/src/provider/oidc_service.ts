import { timingSafeEqual } from 'node:crypto'
import { NoopRecorder, type ClientConfig, type MetricsRecorder } from '@dudousxd/adonis-authkit-core'
import Koa from 'koa'
import mount from 'koa-mount'
import type { ResolvedServerConfig } from '../define_config.js'
import { wireProviderEvents } from '../observability/wire_provider_events.js'
import { buildProvider } from './build_provider.js'
import { createInteractionActions, type InteractionActions } from './interaction_actions.js'
import { registerTokenExchange } from './token_exchange.js'
import { readActiveOrgFromKoaCtx } from '../host/active_org_cookie.js'

export class OidcService {
  readonly provider: ReturnType<typeof buildProvider>
  readonly callback: (req: any, res: any) => void
  /** Pathname do issuer sem barra final (ex.: `/oidc`). Vazio quando montado na raiz. */
  readonly mountPath: string
  readonly recorder: MetricsRecorder
  readonly interactions: InteractionActions
  #clients: ClientConfig[]
  #config: ResolvedServerConfig

  get config(): ResolvedServerConfig {
    return this.#config
  }

  constructor(config: ResolvedServerConfig, appKey: string, recorder: MetricsRecorder = new NoopRecorder()) {
    this.#config = config
    this.#clients = config.clients ?? []
    this.recorder = recorder
    this.provider = buildProvider(config, {
      appKey,
      findAccount: async (ctx, sub) => {
        const user = await config.findAccount(sub)
        if (!user) return undefined

        // Lê a org ativa do cookie de sessão (se organizations estiver disponível).
        const activeOrg = readActiveOrgFromKoaCtx(ctx)

        return {
          accountId: user.id,
          claims: async (_use: string, _scope: string) => {
            const base: Record<string, unknown> = {
              sub: user.id,
              email: user.email,
              email_verified: true,
              name: user.name,
              picture: user.avatarUrl,
              [config.globalRolesClaim]: user.globalRoles ?? [],
            }
            // Emite claims de org somente quando há uma org ativa na sessão.
            if (activeOrg) {
              base['org_id'] = activeOrg.orgId
              base['org_slug'] = activeOrg.orgSlug
              base['org_role'] = activeOrg.orgRole
            }
            return base
          },
        }
      },
    })
    wireProviderEvents(this.provider, recorder)

    registerTokenExchange(this.provider, {
      findAccount: config.findAccount,
      globalRolesClaim: config.globalRolesClaim,
      audit: config.audit,
    })

    // Quando o issuer tem um path (ex.: http://host/oidc), o provider precisa ser
    // MONTADO sob esse path via koa-mount. Isso faz o oidc-provider gerar URLs de
    // discovery e redirects de resume/interaction CORRETAMENTE prefixados (ex.:
    // /oidc/auth, /oidc/jwks). Apenas remover o prefixo de req.url (abordagem antiga)
    // fazia o provider se enxergar na raiz e anunciar URLs sem o /oidc.
    // Para issuer na raiz, o mountPath é vazio e usamos o callback Node direto.
    this.mountPath = new URL(this.provider.issuer).pathname.replace(/\/+$/, '')
    if (this.mountPath && this.mountPath !== '/') {
      const koa = new Koa()
      // O app externo PRECISA herdar as Keygrip keys do provider. Sob koa-mount as
      // requisições do provider rodam no contexto do app EXTERNO, então `ctx.cookies`
      // usa as keys deste app. Sem isso, os cookies (_interaction, _session) seriam
      // assinados/lidos de forma inconsistente entre o fluxo via mount (authorize) e as
      // chamadas diretas `interactionDetails`/`interactionFinished` (que usam o contexto
      // do provider), quebrando o "interaction session id cookie not found".
      koa.keys = (this.provider as any).keys
      koa.proxy = (this.provider as any).proxy
      koa.use(mount(this.mountPath, this.provider as any))
      this.callback = koa.callback()
    } else {
      this.callback = this.provider.callback()
    }

    this.interactions = createInteractionActions(this.provider, { verifyCredentials: config.verifyCredentials })
  }

  /**
   * Invalida o cache de clients DINÂMICOS do oidc-provider (a `dynamicClients`
   * QuickLRU em `instance(provider)`). DEVE ser chamado após qualquer escrita
   * (create/update/delete) no model `Client` via adapter, pelo console admin.
   *
   * NOTA sobre o porquê: o oidc-provider v9 cacheia clients carregados do adapter
   * numa LRU CUJA CHAVE É O HASH (sha256) DO PAYLOAD persistido — não o client_id.
   * Por isso uma alteração de metadata já é "auto-invalidante": `Client.find` relê o
   * adapter, hasheia o payload NOVO, dá cache-miss e reconstrói o client. Mesmo assim
   * limpamos a LRU explicitamente para (a) tornar o efeito imediato e determinístico
   * (sem depender de pressão de LRU para expulsar a entrada antiga, agora inalcançável)
   * e (b) liberar a entrada órfã na hora. É o caminho de invalidação suportado: a LRU
   * é um detalhe interno acessível via o helper `weak_cache` do próprio provider.
   */
  async evictDynamicClientCache(): Promise<void> {
    try {
      const wc: any = await import('oidc-provider/lib/helpers/weak_cache.js')
      const get = wc.default ?? wc.get
      const int = get(this.provider)
      int?.dynamicClients?.clear?.()
    } catch {
      // Estrutura interna mudou numa versão futura do oidc-provider: a invalidação por
      // hash-de-conteúdo (acima) continua garantindo correção; só perdemos a expulsão
      // imediata da entrada órfã. Best-effort — não propaga erro pro caminho da request.
    }
  }

  /** Verifica client_id + client_secret contra os clients da config (p/ endpoints custom como introspecção de PAT). */
  verifyClientCredentials(clientId: string, clientSecret: string): boolean {
    const client = this.#clients.find((c) => c.clientId === clientId)
    if (!client || !client.clientSecret) return false
    const a = Buffer.from(client.clientSecret)
    const b = Buffer.from(clientSecret)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
