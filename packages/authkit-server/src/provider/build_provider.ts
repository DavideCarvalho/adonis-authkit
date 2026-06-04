import * as oidc from 'oidc-provider'
import type { ResolvedServerConfig } from '../define_config.js'

export interface BuildProviderOptions {
  /** APP_KEY do consumidor; usado p/ derivar cookies.keys se não houver. */
  appKey: string
  findAccount: (ctx: any, sub: string, token?: any) => Promise<any>
}

export function buildProvider(config: ResolvedServerConfig, options: BuildProviderOptions) {
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
      profile: ['name', 'picture', config.globalRolesClaim],
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
    },
    ttl: {
      AccessToken: config.ttl.accessToken,
      RefreshToken: config.ttl.refreshToken,
      IdToken: config.ttl.idToken,
      Session: config.ttl.session,
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
