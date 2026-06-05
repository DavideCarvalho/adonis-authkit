/** Registro estático de um client OIDC. */
export interface ClientConfig {
  clientId: string
  clientSecret?: string
  redirectUris: string[]
  postLogoutRedirectUris?: string[]
  grants?: string[]
  /** 'none' para public clients (SPA com PKCE) */
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post' | 'none'
  /**
   * Endpoint do RP que recebe o POST de OIDC Back-Channel Logout. Quando definido,
   * o IdP envia um `logout_token` para esta URI ao encerrar a sessão/grant do usuário.
   */
  backchannelLogoutUri?: string
  /**
   * Exige que o `logout_token` inclua a claim `sid` (session id). Mapeado para
   * `backchannel_logout_session_required` do oidc-provider. Default: false.
   */
  backchannelLogoutSessionRequired?: boolean
}

export interface TtlConfig {
  accessToken?: string | number
  refreshToken?: string | number
  idToken?: string | number
  session?: string | number
}

export interface JwksConfig {
  /** 'managed' = lib gera/rotaciona/persiste; 'jwks' = fornecido inline */
  source: 'managed' | 'jwks'
  /** usado quando source='managed' */
  rotationDays?: number
  algorithm?: 'RS256' | 'ES256' | 'PS256' | 'EdDSA'
  /**
   * Caminho de um arquivo JSON onde o JWKS PRIVADO managed é persistido. Quando
   * presente, as chaves sobrevivem a restarts e podem ser rotacionadas com
   * `node ace authkit:rotate-keys`. Quando ausente, o modo managed gera uma
   * chave efêmera por boot (sem rotação real).
   */
  store?: string
  /** usado quando source='jwks' */
  keys?: Record<string, unknown>[]
}

export interface ObservabilityConfig {
  metrics?: boolean
  jsonRoutes?: boolean
  dashboard?: boolean
}

/** Forma normalizada do config do server (pós-`defineConfig`). */
export interface ResolvedAuthServerConfig {
  issuer: string
  clients: ClientConfig[]
  ttl: Required<TtlConfig>
  jwks: JwksConfig
  globalRolesClaim: string
  cookieKeys: string[]
  observability: ObservabilityConfig
}
