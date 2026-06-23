import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { configProvider } from '@adonisjs/core'
import { RuntimeException } from '@adonisjs/core/exceptions'
import type { ApplicationService } from '@adonisjs/core/types'
import type { MetricsRecorder } from '@adonis-agora/authkit-core'
import { OidcService } from '../src/provider/oidc_service.js'
import { KeystoreReloadPoller } from '../src/provider/keystore_reload.js'
import { KeyRotationScheduler } from '../src/provider/key_rotation_scheduler.js'
import { makeSingleFlightLock } from '../src/provider/single_flight_lock.js'
import { resolveEffectiveKeyRotation } from '../src/host/key_rotation.js'
import { RuntimeSettings } from '../src/host/runtime_settings.js'
import { defaultEncryptForStore, type ResolvedServerConfig } from '../src/define_config.js'
import { resolveKeystoreVault, KeystoreManager } from '../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../src/keys/keystore_codec.js'
import { loadEncryptionService } from '../src/keys/keystore_crypto.js'
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
    // Config locks: trava as settings definidas explicitamente no defineConfig
    // (config vence em runtime; a UI/Admin API não pode alterá-las). Fail-safe:
    // qualquer erro → sem locks (comportamento legado).
    try {
      const value = this.app.config.get('authkit')
      if (value) {
        const config = (await configProvider.resolve(this.app, value)) as ResolvedServerConfig | null
        if (config) {
          if (config.lockedSettingKeys?.length) {
            const { setLockedSettingKeys } = await import('../src/host/config_locks.js')
            setLockedSettingKeys(config.lockedSettingKeys)
          }
          // Stash dos bits de routing p/ o registerAuthHost ler do config (dedup).
          // boot() roda antes do preload start/routes.ts, então estará disponível lá.
          const { setAuthHostConfig } = await import('../src/host/auth_host_config.js')
          setAuthHostConfig({
            mountPath: config.mountPath,
            social: config.social,
            rateLimit: config.rateLimit,
            adminEnabled: config.admin.enabled,
            adminApiEnabled: config.adminApi.enabled,
          })
        }
      }
    } catch {
      /* sem locks / sem stash → registerAuthHost cai em opts/defaults */
    }

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
          'Config inválido em "config/authkit.ts". Use o método defineConfig de @adonis-agora/authkit-server.'
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
            'O @adonis-agora/authkit-server precisa dele para assinar os cookies do oidc-provider.'
        )
      }
      const metrics = await this.app.container.make('authkit.metrics')

      const jwksInput = config.jwksConfig
      let jwksLoader: (() => Promise<{ keys: Record<string, any>[] }>) | undefined
      let keystoreHead: (() => Promise<string | null>) | undefined
      let keystoreManager: (() => Promise<KeystoreManager>) | undefined
      if (jwksInput?.source === 'managed' && jwksInput?.store) {
        const appRef = this.app
        const buildManager = async () => {
          const vault = resolveKeystoreVault(jwksInput.store as any, { makePath: (p) => appRef.makePath(p), container: appRef.container })
          const encrypt = (jwksInput as any).encrypt ?? defaultEncryptForStore(jwksInput.store as any)
          // best-effort (≠ boot, que lança): se a encryption sumir em runtime, o reload
          // degrada para "sem hot-reload" (o onError do poller engole) em vez de derrubar o processo.
          const enc = encrypt ? await loadEncryptionService().catch(() => undefined) : undefined
          return new KeystoreManager(vault, new KeystoreCodec({ encrypt, enc }), jwksInput.algorithm ?? 'RS256')
        }
        jwksLoader = async () => {
          const m = await buildManager()
          const store = (await m.read()) ?? (await m.ensure())
          return { keys: store.keys.map(({ iat: _iat, ...jwk }) => jwk) }
        }
        keystoreHead = async () => {
          const m = await buildManager()
          return m.head()
        }
        keystoreManager = async () => buildManager()
      }

      return new OidcService(config, appKey, metrics, { jwksLoader, keystoreHead, keystoreManager })
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
          'accountStore não configurado em "config/authkit.ts". Use defineConfig de @adonis-agora/authkit-server.'
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

  /**
   * Gestão automática de schema: com `schema.autoManage` (default), garante
   * as tabelas do authkit no start — cria as que faltam e adiciona colunas
   * novas (aditivo). Falha de DB aqui não derruba o boot: loga warning e as
   * features degradam como sempre degradaram (capability probing).
   */
  async start() {
    try {
      const value = this.app.config.get('authkit')
      if (!value) return
      const config = (await configProvider.resolve(this.app, value)) as ResolvedServerConfig | null
      if (!config?.schema?.autoManage) return

      const db = await this.app.container.make('lucid.db' as any).catch(() => null)
      if (!db) return // host sem @adonisjs/lucid — nada a gerenciar

      const { ensureAuthkitSchema } = await import('../src/schema/ensure.js')
      const report = await ensureAuthkitSchema(db, { connection: config.schema.connection })

      const logger = await this.app.container.make('logger').catch(() => null)
      if (report.created.length > 0) {
        logger?.info('authkit: created tables %s', report.created.join(', '))
      }
      for (const [table, columns] of Object.entries(report.altered)) {
        logger?.info('authkit: added columns to %s: %s', table, columns.join(', '))
      }
    } catch (error) {
      const logger = await this.app.container.make('logger').catch(() => null)
      logger?.warn(
        { err: error },
        'authkit: schema auto-manage failed — features degrade gracefully; ' +
          'run ensureAuthkitSchema() in a migration or fix DB connectivity'
      )
    }

    await this.#startKeystoreReloadPoll()
    await this.#startKeyRotationScheduler()
  }

  /**
   * Inicia o poll de reload do keystore: a cada intervalo lê um `head` barato do
   * cofre e dispara `reloadKeys()` quando ele muda, propagando rotações feitas
   * por outro processo (`authkit:keys:rotate`) ou instância sem restart. Só roda
   * no ambiente `web` (evita pollers em comandos ace/testes) e só quando o
   * OidcService de fato tem um `keystoreHead` (managed + store). Fail-safe:
   * qualquer erro vira no-op (logado como warning); `unref()` impede o timer de
   * manter o processo vivo.
   */
  async #startKeystoreReloadPoll() {
    if (this.app.getEnvironment() !== 'web') return
    const svc = await this.app.container.make('authkit.server').catch(() => null)
    const headFn = svc?.keystoreHead
    if (!svc || !headFn) return

    const logger = await this.app.container.make('logger').catch(() => null)
    const poller = new KeystoreReloadPoller({
      head: () => headFn(),
      reload: () => svc.reloadKeys(),
      intervalMs: 60_000,
      onError: (err) => logger?.warn({ err }, 'authkit: keystore reload poll falhou (fail-safe)'),
    })
    poller.start()
  }

  /**
   * Inicia o scheduler de rotação age-based (housekeeping). Só no ambiente `web` e
   * só quando o OidcService tem keystore gerenciável (rotateKeys disponível). Lê a
   * política via RuntimeSettings (construída a partir do lucid.db, sem request);
   * single-flight via @adonisjs/lock (opt-in). Fail-safe.
   */
  async #startKeyRotationScheduler() {
    if (this.app.getEnvironment() !== 'web') return
    const svc: any = await this.app.container.make('authkit.server').catch(() => null)
    if (!svc || typeof svc.rotateKeys !== 'function' || typeof svc.keystoreAgeDays !== 'function') return
    // só faz sentido com keystore gerenciável:
    if ((await svc.keystoreAgeDays().catch(() => null)) === null) return

    const db = await this.app.container.make('lucid.db' as any).catch(() => null)
    if (!db) return // sem Lucid → sem settings → política seria defaults(disabled); nada a agendar

    const logger = await this.app.container.make('logger').catch(() => null)

    // Resolve a connection do schema config para que RuntimeSettings use a mesma
    // conexão que o resto do authkit (mesmo padrão do expire_scan_command).
    const value = this.app.config.get('authkit')
    const config = value
      ? ((await configProvider.resolve(this.app, value).catch(() => null)) as ResolvedServerConfig | null)
      : null
    const connection = config?.schema?.connection

    // RuntimeSettings sem request (mesmo padrão de expire_scan_command / security_notice_service).
    const settings = new RuntimeSettings(db, connection ? { connection } : {})

    const withLock = makeSingleFlightLock({ key: 'authkit:keys:rotate', ttlMs: 5 * 60_000 })
    const scheduler = new KeyRotationScheduler({
      policy: () => resolveEffectiveKeyRotation(settings),
      ageDays: () => svc.keystoreAgeDays(),
      rotateKeys: (keep: number) => svc.rotateKeys(keep),
      withLock,
      intervalMs: 60 * 60_000, // 1h
      onError: (err) => logger?.warn({ err }, 'authkit: key rotation scheduler falhou (fail-safe)'),
    })
    scheduler.start()
  }
}
