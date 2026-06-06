import * as oidc from 'oidc-provider'
import type { ResolvedServerConfig } from '../define_config.js'
import { createDeviceSources } from './device_sources.js'

export interface BuildProviderOptions {
  /** APP_KEY do consumidor; usado p/ derivar cookies.keys se não houver. */
  appKey: string
  findAccount: (ctx: any, sub: string, token?: any) => Promise<any>
}

/**
 * Holder mutável dos TTLs de sessão OIDC. Lido de forma SÍNCRONA pelo TTL function do
 * oidc-provider (que não aceita async). Atualizado assincronamente após write/reset
 * da setting `session_policy` via `updateSessionTtlHolder`.
 *
 * Valores em SEGUNDOS. `rememberSec` é o TTL da sessão persistente (remember-me ON).
 * `transientSec` é o TTL da sessão transiente (remember-me OFF ou rememberEnabled=false).
 */
export interface SessionTtlHolder {
  /** TTL da sessão persistente (remember-me ON). Segundos. */
  rememberSec: number
  /** TTL da sessão transiente (browser session). Segundos. */
  transientSec: number
}

/** Atualiza o holder mutável do TTL de sessão com os valores da setting. */
export function updateSessionTtlHolder(
  holder: SessionTtlHolder,
  policy: { rememberDays: number; defaultSessionHours: number }
): void {
  holder.rememberSec = Math.max(1, Math.floor(policy.rememberDays * 86400))
  holder.transientSec = Math.max(1, Math.floor(policy.defaultSessionHours * 3600))
}

export function buildProvider(
  config: ResolvedServerConfig,
  options: BuildProviderOptions,
  sessionTtlHolder?: SessionTtlHolder
) {
  const cookieKeys = config.cookieKeys.length ? config.cookieKeys : [options.appKey]

  // OIDC Dynamic Client Registration (RFC 7591/7592). Só montamos as chaves de feature
  // quando habilitado — desligado (default), o oidc-provider não expõe o endpoint /reg.
  // O `initialAccessToken`: string => valida o bearer contra esse valor estático; ausente
  // => `false` (registro ABERTO; raramente desejável em prod). Clients registrados aqui
  // são persistidos automaticamente pelo MESMO AdapterClass, coexistindo com os estáticos.
  const dynReg = config.dynamicRegistration
  const registrationFeatures = dynReg.enabled
    ? {
        registration: {
          enabled: true,
          initialAccessToken: dynReg.initialAccessToken ?? false,
        },
        ...(dynReg.management ? { registrationManagement: { enabled: true } } : {}),
      }
    : {}

  // Device Authorization Grant (RFC 8628). Quando ligado, montamos a feature com
  // as três sources de UI i18n-izadas (entrada/confirmação/sucesso do user-code).
  const deviceFlowFeatures = config.deviceFlow.enabled
    ? { deviceFlow: { enabled: true, ...createDeviceSources(config.messages) } }
    : {}

  // DPoP (RFC 9449). A chave EXATA do oidc-provider v9 é `dPoP`.
  const dpopFeatures = config.dpop.enabled ? { dPoP: { enabled: true } } : {}

  // PAR (RFC 9126).
  const parFeatures = config.par.enabled
    ? {
        pushedAuthorizationRequests: {
          enabled: true,
          requirePushedAuthorizationRequests: config.par.requirePushedAuthorizationRequests,
        },
      }
    : {}

  // Access Tokens RFC 9068 (JWT) via Resource Indicators (RFC 8707). Só montamos a
  // feature quando ALGUM AT deve ser JWT — caso contrário (default opaque) o
  // oidc-provider mantém o comportamento atual (AT opaco introspecionável) intocado.
  //
  // Um JWT AT no oidc-provider SEMPRE exige um resource indicator com `aud`: o
  // `defaultResource` injeta a resource default (o `audience`, default issuer) quando
  // o client não pede `resource` explicitamente, e o `getResourceServerInfo` descreve
  // a API (scope/audience/formato/TTL) — onde `accessTokenFormat: 'jwt'` faz o token
  // sair como JWS `typ: at+jwt` assinado com a chave corrente do JWKS.
  const at = config.accessTokens
  const allScopes = ['openid', 'profile', 'email', 'offline_access', 'roles']
  const resourceIndicatorFeatures = at.anyJwt
    ? {
        resourceIndicators: {
          enabled: true,
          defaultResource: async (_ctx: any, _client: any, oneOf?: string[]) => {
            // Nas trocas (code/refresh/device), o provider passa `oneOf` com as
            // resources já concedidas — devolvemos para não falhar a request.
            if (oneOf) return oneOf
            // Authorize/sem resource explícito: liga ao resource default (modo simples).
            return at.audience
          },
          useGrantedResource: async () => true,
          getResourceServerInfo: (_ctx: any, resourceIndicator: string, _client: any) => {
            const rc = at.resources[resourceIndicator]
            const format = rc?.format ?? (resourceIndicator === at.audience ? at.format : 'opaque')
            const audience = rc?.audience ?? resourceIndicator
            const scope = (rc?.scopes ?? allScopes).join(' ')
            const info: Record<string, any> = {
              scope,
              audience,
              accessTokenFormat: format,
            }
            const ttl = rc?.expiresIn
            if (ttl !== undefined) info.accessTokenTTL = ttl
            if (format === 'jwt') {
              // Assina com a chave de assinatura corrente do keystore (mesma do JWKS).
              info.jwt = { sign: { alg: config.jwks.keys[0]?.alg ?? 'RS256' } }
            }
            return info
          },
        },
      }
    : {}

  const provider = new oidc.Provider(config.issuer, {
    adapter: config.AdapterClass as any,
    clients: config.clients.map((c) => ({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uris: c.redirectUris,
      post_logout_redirect_uris: c.postLogoutRedirectUris ?? [],
      grant_types: c.grants ?? ['authorization_code', 'refresh_token'],
      response_types: (c.grants ?? ['authorization_code']).includes('authorization_code')
        ? ['code']
        : [],
      token_endpoint_auth_method:
        c.tokenEndpointAuthMethod ?? (c.clientSecret ? 'client_secret_basic' : 'none'),
      // OIDC Back-Channel Logout: só envia as chaves quando o client as declara,
      // p/ não forçar metadata vazio em clients que não usam o recurso.
      ...(c.backchannelLogoutUri ? { backchannel_logout_uri: c.backchannelLogoutUri } : {}),
      ...(c.backchannelLogoutSessionRequired !== undefined
        ? { backchannel_logout_session_required: c.backchannelLogoutSessionRequired }
        : {}),
    })),
    findAccount: options.findAccount,
    jwks: config.jwks,
    cookies: {
      keys: cookieKeys,
      // O oidc-provider define o path do cookie _interaction como
      // `/auth/interaction/<uid>` (exato) via `...cookieOptions` que
      // SOBRESCREVE o path explícito. Sem `path: '/'` o cookie ficaria
      // restrito ao path exato da tela de interaction e NÃO seria enviado
      // pelo browser no POST de subpaths como `.../consent` ou `.../login`.
      // Definir path: '/' na família "short" garante que os cookies de
      // interaction e resume sejam enviados em todos os endpoints OIDC/auth.
      short: { path: '/' },
      long: { path: '/' },
    },
    // conformIdTokenClaims=false: caso contrário (default v9), no fluxo Authorization Code
    // — onde também é emitido um Access Token — o oidc-provider mascara o ID token para
    // apenas o escopo `openid` (só `sub`), removendo email/profile/roles do ID token.
    // O client valida o ID TOKEN, então precisamos que as claims configuradas cheguem nele.
    conformIdTokenClaims: false,
    // A claim de roles globais é atrelada ao escopo `profile` (sempre concedido pelos
    // scopes padrão do client: openid profile email offline_access). Assim as roles chegam
    // no ID token sem exigir um escopo `roles` customizado. Mantemos também o mapeamento
    // do escopo `roles` para quem optar por solicitá-lo explicitamente.
    claims: {
      openid: ['sub'],
      profile: ['name', 'picture', config.globalRolesClaim, 'org_id', 'org_slug', 'org_role'],
      email: ['email', 'email_verified'],
      roles: [config.globalRolesClaim],
    },
    scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],
    // Permite que o parametro `audience` (hint de intencao do client, ex.: 'advisor')
    // sobreviva ao authorize e fique disponivel em interactionDetails().params.audience.
    extraParams: ['audience'],
    pkce: { methods: ['S256'], required: () => true },
    rotateRefreshToken: true,
    features: {
      devInteractions: { enabled: false },
      rpInitiatedLogout: { enabled: true },
      // OIDC Back-Channel Logout: o oidc-provider POSTa um logout_token para o
      // `backchannel_logout_uri` de cada RP quando a sessão/grant é encerrada.
      backchannelLogout: { enabled: true },
      revocation: { enabled: true },
      introspection: { enabled: true },
      ...registrationFeatures,
      ...deviceFlowFeatures,
      ...dpopFeatures,
      ...parFeatures,
      ...resourceIndicatorFeatures,
    },
    // Step-up auth (acr_values): anuncia os acr suportados para que clients possam
    // solicitá-los. A exigência efetiva do 2º fator acontece na interaction de login.
    acrValues: config.stepUp.acrValues,
    ttl: {
      AccessToken: config.ttl.accessToken,
      RefreshToken: config.ttl.refreshToken,
      IdToken: config.ttl.idToken,
      // Session TTL: quando um SessionTtlHolder é fornecido, usa uma função que diferencia
      // sessões persistentes (remember-me ON → rememberSec) das transientes (remember-me
      // OFF → transientSec). A função é SÍNCRONA (restrição do oidc-provider). O holder é
      // atualizado de forma assíncrona após write/reset da setting `session_policy`.
      // `session.transient` é true quando `result.login.remember === false` (o provider
      // seta `transient: !remember` em loginAccount — ver shared/session.js do oidc-provider).
      // Sem holder: fallback ao TTL estático do config (zero regressão).
      Session: sessionTtlHolder
        ? (_ctx: any, session: any) =>
            session.transient
              ? (sessionTtlHolder as SessionTtlHolder).transientSec
              : (sessionTtlHolder as SessionTtlHolder).rememberSec
        : config.ttl.session,
      Interaction: 3600,
      Grant: config.ttl.refreshToken,
    },
    interactions: {
      // Telas de interaction são servidas pelo CONSUMIDOR na RAIZ (fora do koa-mount do
      // provider sob /oidc), evitando colisão com o catch-all /oidc/*. O provider redireciona
      // o browser para cá; o consumidor chama interactionFinished, que devolve ao resume do
      // provider em /oidc/auth/:uid (já corretamente prefixado pelo koa-mount).
      url: (_ctx: any, interaction: any) => `/auth/interaction/${interaction.uid}`,
    },
  })

  provider.proxy = true
  return provider
}
