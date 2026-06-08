import { configProvider } from '@adonisjs/core'
import type { Identity } from '@dudousxd/adonis-authkit-core'
import { resolvers, type ResolverFactory } from './resolvers/factory.js'
import type { SessionIndex } from './backchannel_logout.js'
import type { RevocationStore } from './revocation/revocation_store.js'

export { resolvers }

/** Callback invocado quando um logout_token válido chega via Back-Channel Logout. */
export type BackchannelLogoutCallback = (event: {
  sid?: string
  sub?: string
}) => Promise<void> | void

/**
 * Back-Channel Logout "pronto" para sessões cookie-based: passe um {@link RevocationStore}
 * e o authkit cuida de tudo —
 *  - deriva o `onBackchannelLogout` (grava a revogação no store);
 *  - expõe o store p/ o `BackchannelRevocationMiddleware` enforçar em cada request.
 *
 * Substitui o trio model+service+middleware que o consumidor escrevia à mão.
 */
export interface BackchannelLogoutInput {
  /** Store que persiste/consulta revogações (ex.: `lucidRevocationStore({ connection: 'auth' })`). */
  store: RevocationStore
}

export interface ClientConfigInput {
  issuer: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  resolver: ResolverFactory
  resolveUser?: (identity: Identity, context: { accessToken?: string }) => Promise<unknown>
  resolveAppRoles?: (identity: Identity) => Promise<string[]>
  sessionKey?: string
  scopes?: string[]
  globalRolesClaim?: string
  /**
   * Invocado após um logout_token VÁLIDO chegar via OIDC Back-Channel Logout. O host
   * usa o sid/sub recebido para destruir as sessões locais correspondentes.
   *
   * Para sessões cookie-based, prefira `backchannelLogout: { store }` — ele deriva
   * este callback automaticamente. Se ambos forem fornecidos, os dois rodam (store primeiro).
   */
  onBackchannelLogout?: BackchannelLogoutCallback
  /** Índice sid/sub -> sessão local consultado pelo handler de back-channel logout. */
  sessionIndex?: SessionIndex
  /** Back-Channel Logout "pronto" para sessões cookie-based — ver {@link BackchannelLogoutInput}. */
  backchannelLogout?: BackchannelLogoutInput
}

export interface ResolvedClientConfig {
  issuer: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  resolverFactory: ResolverFactory
  resolveUser?: (identity: Identity, context: { accessToken?: string }) => Promise<unknown>
  resolveAppRoles?: (identity: Identity) => Promise<string[]>
  sessionKey: string
  scopes: string[]
  globalRolesClaim: string
  onBackchannelLogout?: BackchannelLogoutCallback
  sessionIndex?: SessionIndex
  /** Store de revogação (cookie-based BCL); consumido pelo BackchannelRevocationMiddleware. */
  backchannelStore?: RevocationStore
}

export function defineConfig(config: ClientConfigInput) {
  return configProvider.create(async (): Promise<ResolvedClientConfig> => {
    const store = config.backchannelLogout?.store

    // Compõe o callback de back-channel: o store grava a revogação; o callback do
    // usuário (se houver) roda depois. Mantém retrocompat com `onBackchannelLogout`.
    const userHook = config.onBackchannelLogout
    const onBackchannelLogout: BackchannelLogoutCallback | undefined =
      store || userHook
        ? async (event) => {
            if (store) await store.revoke(event)
            if (userHook) await userHook(event)
          }
        : undefined

    return {
      issuer: config.issuer,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      resolverFactory: config.resolver,
      resolveUser: config.resolveUser,
      resolveAppRoles: config.resolveAppRoles,
      sessionKey: config.sessionKey ?? 'authkit',
      scopes: config.scopes ?? ['openid', 'profile', 'email', 'offline_access'],
      globalRolesClaim: config.globalRolesClaim ?? 'roles',
      onBackchannelLogout,
      sessionIndex: config.sessionIndex,
      backchannelStore: store,
    }
  })
}
