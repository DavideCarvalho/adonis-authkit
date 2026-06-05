import { createContext, useContext } from 'react'

/**
 * Endpoints JSON que os hooks de dados (`useProfile`, `useSessions`,
 * `useAuthorizedApps`, passkeys) consultam.
 *
 * Os defaults apontam para as rotas reais do host-kit
 * (`@dudousxd/adonis-authkit-server`). Numa topologia de *client app*
 * (o app não é o IdP), aponte-os para rotas locais do app que
 * redirecionam/proxiam para o IdP.
 */
export interface AuthkitEndpoints {
  /** GET retorna o usuário; POST atualiza o perfil. Default: `/account/security/profile` */
  profile: string
  /** GET lista sessões/dispositivos confiáveis. Default: `/account/security` */
  sessions: string
  /** GET lista apps autorizados; revoke em `${apps}/:clientId/revoke`. Default: `/account/apps` */
  apps: string
  /** GET lista passkeys. Default: `/account/mfa/passkeys` */
  passkeys: string
}

/**
 * Configuração do `<AuthkitProvider>`. Todos os campos são opcionais; defaults
 * apontam para as rotas reais do host-kit.
 */
export interface AuthkitConfig {
  /** URL de início de login (OIDC é redirect-based). Default: `/auth/login` */
  loginUrl?: string
  /** URL de logout. Default: `/account/logout` */
  logoutUrl?: string
  /** URL da página de perfil/segurança. Default: `/account/security` */
  profileUrl?: string
  /** override parcial dos endpoints JSON */
  endpoints?: Partial<AuthkitEndpoints>
  /**
   * Token CSRF a ser enviado como header `X-CSRF-TOKEN` nas mutações JSON.
   * Em apps Inertia/AdonisJS, passe `usePage().props.csrfToken` (ou similar).
   */
  csrfToken?: string
}

/** Configuração já resolvida (sem campos opcionais). */
export interface ResolvedAuthkitConfig {
  loginUrl: string
  logoutUrl: string
  profileUrl: string
  endpoints: AuthkitEndpoints
  csrfToken?: string
}

export const DEFAULT_CONFIG: ResolvedAuthkitConfig = {
  loginUrl: '/auth/login',
  logoutUrl: '/account/logout',
  profileUrl: '/account/security',
  endpoints: {
    profile: '/account/security/profile',
    sessions: '/account/security',
    apps: '/account/apps',
    passkeys: '/account/mfa/passkeys',
  },
}

/**
 * Mescla a config do usuário com os defaults (deep-merge raso em `endpoints`).
 * Pura e testável.
 */
export function resolveConfig(config?: AuthkitConfig): ResolvedAuthkitConfig {
  return {
    loginUrl: config?.loginUrl ?? DEFAULT_CONFIG.loginUrl,
    logoutUrl: config?.logoutUrl ?? DEFAULT_CONFIG.logoutUrl,
    profileUrl: config?.profileUrl ?? DEFAULT_CONFIG.profileUrl,
    endpoints: {
      profile: config?.endpoints?.profile ?? DEFAULT_CONFIG.endpoints.profile,
      sessions: config?.endpoints?.sessions ?? DEFAULT_CONFIG.endpoints.sessions,
      apps: config?.endpoints?.apps ?? DEFAULT_CONFIG.endpoints.apps,
      passkeys: config?.endpoints?.passkeys ?? DEFAULT_CONFIG.endpoints.passkeys,
    },
    csrfToken: config?.csrfToken,
  }
}

/**
 * Constrói uma URL de login/logout acrescentando `returnTo` (encodado) se houver.
 * Pura e SSR-safe (não toca em `window`).
 */
export function buildAuthUrl(base: string, returnTo?: string): string {
  if (!returnTo) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}returnTo=${encodeURIComponent(returnTo)}`
}

export const AuthkitConfigContext = createContext<ResolvedAuthkitConfig>(DEFAULT_CONFIG)

/** Lê a config resolvida do `<AuthkitProvider>` (ou defaults). */
export function useAuthkitConfig(): ResolvedAuthkitConfig {
  return useContext(AuthkitConfigContext)
}
