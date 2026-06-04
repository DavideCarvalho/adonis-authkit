import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configProvider } from '@adonisjs/core'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { ApplicationService } from '@adonisjs/core/types'
import type { MetricsRecorder } from '@dudousxd/adonis-authkit-core'
import { OidcService } from '../src/provider/oidc_service.js'
import type { ResolvedServerConfig } from '../src/define_config.js'
import type { AccountStore } from '../src/accounts/account_store.js'
import type { PatStore } from '../src/pat/pat_store.js'

declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    'authkit.server': OidcService
    'authkit.metrics': MetricsRecorder
    'authkit.accountStore': AccountStore
    'authkit.patStore': PatStore
  }
}

export default class AuthkitServerProvider {
  constructor(protected app: ApplicationService) {}

  async boot() {
    // Registra o disco "authkit" no edge.js para que os templates sejam referenciados
    // como `authkit::login`, `authkit::account/tokens`, etc.
    // Resolve o diretório das views tanto em produção (provider compilado em
    // `build/providers/`, views copiadas para `build/host/views`) quanto em dev
    // (rodando de `providers/` via ts-exec; views em `build/host/views` após build
    // ou em `src/host/views` sem build).
    const candidates = [
      new URL('../host/views', import.meta.url), // prod: build/providers → build/host/views
      new URL('../build/host/views', import.meta.url), // dev: providers → build/host/views
      new URL('../src/host/views', import.meta.url), // dev sem build: providers → src/host/views
    ]
    const viewsUrl = candidates.find((u) => existsSync(fileURLToPath(u)))
    if (!viewsUrl) return // nenhum dir de views resolvível

    try {
      const edge = await import('edge.js')
      const edgeInstance = (edge as any).default ?? edge
      edgeInstance.mount('authkit', viewsUrl)
    } catch {
      // edge.js ausente (host headless/Inertia-only que não usa edgeRenderer) — ignora.
    }
  }

  register() {
    this.app.container.singleton('authkit.server', async () => {
      const configProviderValue = this.app.config.get('authkit')
      const config = (await configProvider.resolve(
        this.app,
        configProviderValue
      )) as ResolvedServerConfig | null
      if (!config) {
        throw new RuntimeException(
          'Config inválido em "config/authkit.ts". Use o método defineConfig de @dudousxd/adonis-authkit-server.'
        )
      }
      // `app.appKey` pode ser uma string crua ou um `Secret` do AdonisJS (config/app.ts
      // expõe `export const appKey = new Secret(env.get('APP_KEY'))`). O oidc-provider
      // assina cookies via keygrip e exige uma string — então liberamos o Secret aqui.
      // Sem isso, a chave chegaria como objeto/undefined e o fluxo de authorize quebraria
      // (keygrip: "key argument must be of type string ...").
      const rawAppKey = this.app.config.get<unknown>('app.appKey')
      const appKey =
        rawAppKey && typeof (rawAppKey as any).release === 'function'
          ? (rawAppKey as any).release()
          : (rawAppKey as string)
      if (!appKey || typeof appKey !== 'string') {
        throw new RuntimeException(
          'APP_KEY ausente: defina `export const appKey = new Secret(env.get(\'APP_KEY\'))` em config/app.ts. ' +
            'O @dudousxd/adonis-authkit-server precisa dele para assinar os cookies do oidc-provider.'
        )
      }
      const metrics = await this.app.container.make('authkit.metrics')
      return new OidcService(config, appKey, metrics)
    })

    this.app.container.singleton('authkit.metrics', async () => {
      const value = this.app.config.get('authkit')
      const config = (await configProvider.resolve(this.app, value)) as ResolvedServerConfig | null
      const { createMetricsRecorder } = await import('../src/observability/metrics_service.js')
      return createMetricsRecorder(config?.observability ?? {}, 'authkit-server')
    })

    this.app.container.singleton('authkit.accountStore', async () => {
      const value = this.app.config.get('authkit')
      const config = (await configProvider.resolve(this.app, value)) as ResolvedServerConfig | null
      if (!config?.accountStore) {
        throw new RuntimeException(
          'accountStore não configurado em "config/authkit.ts". Use defineConfig de @dudousxd/adonis-authkit-server.'
        )
      }
      return config.accountStore
    })

    this.app.container.singleton('authkit.patStore', async () => {
      const value = this.app.config.get('authkit')
      const config = (await configProvider.resolve(this.app, value)) as ResolvedServerConfig | null
      if (!config?.patStore) {
        throw new RuntimeException(
          'patStore não configurado em "config/authkit.ts" — necessário para fluxos de PAT.'
        )
      }
      return config.patStore
    })
  }
}
