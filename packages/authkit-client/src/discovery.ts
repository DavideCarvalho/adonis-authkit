/**
 * OIDC Discovery (RFC 8414 / OpenID Connect Discovery 1.0).
 *
 * Os helpers de fluxo deste pacote historicamente assumiam as rotas do
 * oidc-provider (`/auth`, `/token`, `/jwks`…) — convenção do authkit-server.
 * IdPs de terceiros (Keycloak, Auth0, Okta, Entra…) usam caminhos próprios,
 * publicados em `{issuer}/.well-known/openid-configuration`.
 *
 * `discoverEndpoints()` resolve os endpoints reais do IdP (com cache por
 * issuer) e cai na convenção do oidc-provider quando o documento não está
 * disponível — então authkit-server continua funcionando offline/sem rede.
 *
 * ```ts
 * const endpoints = await discoverEndpoints(issuer)
 * const url = buildAuthorizeUrl({ issuer, authorizationEndpoint: endpoints.authorizationEndpoint, ... })
 * const tokens = await exchangeCode({ issuer, tokenEndpoint: endpoints.tokenEndpoint, ... })
 * ```
 */

export interface OidcEndpoints {
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  endSessionEndpoint?: string
  userinfoEndpoint?: string
  introspectionEndpoint?: string
}

/**
 * Convenção do oidc-provider (authkit-server) — usada como fallback quando o
 * documento de discovery não está acessível.
 */
export function conventionEndpoints(issuer: string): OidcEndpoints {
  const base = issuer.replace(/\/$/, '')
  return {
    authorizationEndpoint: `${base}/auth`,
    tokenEndpoint: `${base}/token`,
    jwksUri: `${base}/jwks`,
    endSessionEndpoint: `${base}/session/end`,
    userinfoEndpoint: `${base}/me`,
    introspectionEndpoint: `${base}/token/introspection`,
  }
}

interface CacheEntry {
  endpoints: OidcEndpoints
  fetchedAt: number
}

const DEFAULT_TTL_MS = 15 * 60_000
const cache = new Map<string, CacheEntry>()

export interface DiscoverOptions {
  /** Overrides manuais — precedem o documento de discovery, campo a campo. */
  overrides?: Partial<OidcEndpoints>
  /** TTL do cache por issuer. Default: 15 min. */
  cacheTtlMs?: number
  fetchImpl?: typeof fetch
}

/**
 * Resolve os endpoints do IdP via `/.well-known/openid-configuration`.
 *
 * - Resultado cacheado por issuer (TTL 15 min) — seguro de chamar por request.
 * - Falha de rede/404 → fallback silencioso para a convenção do oidc-provider
 *   (o cache também guarda o fallback, evitando refetch em loop).
 * - `overrides` sempre vencem, campo a campo.
 */
export async function discoverEndpoints(
  issuer: string,
  options: DiscoverOptions = {}
): Promise<OidcEndpoints> {
  const base = issuer.replace(/\/$/, '')
  const ttl = options.cacheTtlMs ?? DEFAULT_TTL_MS

  const cached = cache.get(base)
  let endpoints: OidcEndpoints
  if (cached && Date.now() - cached.fetchedAt < ttl) {
    endpoints = cached.endpoints
  } else {
    endpoints = await fetchDiscovery(base, options.fetchImpl ?? fetch)
    cache.set(base, { endpoints, fetchedAt: Date.now() })
  }

  if (!options.overrides) return endpoints
  const merged = { ...endpoints }
  for (const [key, value] of Object.entries(options.overrides)) {
    if (value !== undefined) (merged as any)[key] = value
  }
  return merged
}

async function fetchDiscovery(base: string, fetchImpl: typeof fetch): Promise<OidcEndpoints> {
  const fallback = conventionEndpoints(base)
  try {
    const res = await fetchImpl(`${base}/.well-known/openid-configuration`, {
      headers: { accept: 'application/json' },
    })
    if (!res.ok) return fallback
    const doc = (await res.json()) as Record<string, unknown>
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
    return {
      authorizationEndpoint: str(doc.authorization_endpoint) ?? fallback.authorizationEndpoint,
      tokenEndpoint: str(doc.token_endpoint) ?? fallback.tokenEndpoint,
      jwksUri: str(doc.jwks_uri) ?? fallback.jwksUri,
      endSessionEndpoint: str(doc.end_session_endpoint) ?? fallback.endSessionEndpoint,
      userinfoEndpoint: str(doc.userinfo_endpoint) ?? fallback.userinfoEndpoint,
      introspectionEndpoint:
        str(doc.introspection_endpoint) ?? fallback.introspectionEndpoint,
    }
  } catch {
    return fallback
  }
}

/** Limpa o cache de discovery (testes). */
export function __clearDiscoveryCacheForTests(): void {
  cache.clear()
}
