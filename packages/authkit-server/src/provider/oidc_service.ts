import { timingSafeEqual } from 'node:crypto'
import { NoopRecorder, type ClientConfig, type MetricsRecorder } from '@dudousxd/adonis-authkit-core'
import Koa from 'koa'
import mount from 'koa-mount'
import type { ResolvedServerConfig } from '../define_config.js'
import { wireProviderEvents } from '../observability/wire_provider_events.js'
import { buildProvider } from './build_provider.js'
import { createInteractionActions, type InteractionActions } from './interaction_actions.js'
import { registerTokenExchange } from './token_exchange.js'

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
      findAccount: async (_ctx, sub) => {
        const user = await config.findAccount(sub)
        if (!user) return undefined
        return {
          accountId: user.id,
          claims: async (_use: string, _scope: string) => ({
            sub: user.id,
            email: user.email,
            email_verified: true,
            name: user.name,
            picture: user.avatarUrl,
            [config.globalRolesClaim]: user.globalRoles ?? [],
          }),
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

  /** Verifica client_id + client_secret contra os clients da config (p/ endpoints custom como introspecção de PAT). */
  verifyClientCredentials(clientId: string, clientSecret: string): boolean {
    const client = this.#clients.find((c) => c.clientId === clientId)
    if (!client || !client.clientSecret) return false
    const a = Buffer.from(client.clientSecret)
    const b = Buffer.from(clientSecret)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
