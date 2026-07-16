import { createContext, useContext } from "react";

/**
 * Endpoints JSON que os hooks de dados (`useProfile`, `useSessions`,
 * `useAuthorizedApps`, passkeys) consultam.
 *
 * Os defaults apontam para as rotas reais do host-kit
 * (`@adonis-agora/authkit-server`). Numa topologia de *client app*
 * (o app não é o IdP), aponte-os para rotas locais do app que
 * redirecionam/proxiam para o IdP.
 */
export interface AuthkitEndpoints {
  /** GET retorna o usuário; POST atualiza o perfil. Default: `/account/security/profile` */
  profile: string;
  /** GET lista sessões/dispositivos confiáveis. Default: `/account/security` */
  sessions: string;
  /** GET lista apps autorizados; revoke em `${apps}/:clientId/revoke`. Default: `/account/apps` */
  apps: string;
  /** GET lista passkeys. Default: `/account/mfa/passkeys` */
  passkeys: string;
  /** GET lista orgs do usuário (JSON). Default: `/account/orgs/json` */
  orgs: string;
  /** GET lista convites pendentes para o e-mail do usuário (JSON). Default: `/account/orgs/invitations/json` */
  orgInvitations: string;
  /**
   * POST consulta a Authz se o usuário pode uma permissão sobre um recurso.
   * Contrato: `{ permission, resource? }` → `{ allowed }`. Default: `/authz/can`.
   * Usado por `useCan`/`<CanPermission>`.
   */
  can: string;
}

/**
 * Configuração do `<AuthkitProvider>`. Todos os campos são opcionais; defaults
 * apontam para as rotas reais do host-kit.
 */
/**
 * Que IdP está atrás do app:
 *
 * - `'authkit'` (default) — o backend roda o authkit-server: TODOS os
 *   componentes funcionam (perfil, orgs, apps autorizados, passkeys…).
 * - `'external'` — o backend autentica contra um IdP de terceiros
 *   (Keycloak, Auth0, Okta… tipicamente via `@adonis-agora/authkit-client`).
 *   Os componentes que dependem da REST surface do authkit-server
 *   (`UserProfile`, `OrganizationSwitcher`, `OrganizationProfile`,
 *   `AuthorizedApps`) degradam para `null` em vez de chamar endpoints que
 *   não existem; `SignInButton`/`SignOutButton`/`useAuth`/`Avatar`
 *   continuam funcionando normalmente.
 */
export type AuthkitIdpMode = "authkit" | "external";

export interface AuthkitConfig {
  /** URL de início de login (OIDC é redirect-based). Default: `/auth/login` */
  loginUrl?: string;
  /** URL de logout. Default: `/account/logout` */
  logoutUrl?: string;
  /** URL da página de perfil/segurança. Default: `/account/security` */
  profileUrl?: string;
  /** override parcial dos endpoints JSON */
  endpoints?: Partial<AuthkitEndpoints>;
  /**
   * Token CSRF a ser enviado como header `X-CSRF-TOKEN` nas mutações JSON.
   * Em apps Inertia/AdonisJS, passe `usePage().props.csrfToken` (ou similar).
   */
  csrfToken?: string;
  /** IdP atrás do app. Default: `'authkit'`. Veja {@link AuthkitIdpMode}. */
  idp?: AuthkitIdpMode;
  /**
   * Path do endpoint de checagem de permissão da Authz consultado por
   * `useCan`/`<CanPermission>`. Atalho para `endpoints.can`. Default: `/authz/can`.
   * Se ambos forem passados, `endpoints.can` vence.
   */
  canPath?: string;
}

/** Configuração já resolvida (sem campos opcionais). */
export interface ResolvedAuthkitConfig {
  loginUrl: string;
  logoutUrl: string;
  profileUrl: string;
  endpoints: AuthkitEndpoints;
  csrfToken?: string;
  idp: AuthkitIdpMode;
}

export const DEFAULT_CONFIG: ResolvedAuthkitConfig = {
  idp: "authkit",
  loginUrl: "/auth/login",
  logoutUrl: "/account/logout",
  profileUrl: "/account/security",
  endpoints: {
    profile: "/account/security/profile",
    sessions: "/account/security",
    apps: "/account/apps",
    passkeys: "/account/mfa/passkeys",
    orgs: "/account/orgs/json",
    orgInvitations: "/account/orgs/invitations/json",
    can: "/authz/can",
  },
};

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
      sessions:
        config?.endpoints?.sessions ?? DEFAULT_CONFIG.endpoints.sessions,
      apps: config?.endpoints?.apps ?? DEFAULT_CONFIG.endpoints.apps,
      passkeys:
        config?.endpoints?.passkeys ?? DEFAULT_CONFIG.endpoints.passkeys,
      orgs: config?.endpoints?.orgs ?? DEFAULT_CONFIG.endpoints.orgs,
      orgInvitations:
        config?.endpoints?.orgInvitations ??
        DEFAULT_CONFIG.endpoints.orgInvitations,
      can:
        config?.endpoints?.can ??
        config?.canPath ??
        DEFAULT_CONFIG.endpoints.can,
    },
    csrfToken: config?.csrfToken,
    idp: config?.idp ?? "authkit",
  };
}

/**
 * Constrói uma URL de login/logout acrescentando `returnTo` (encodado) se houver.
 * Pura e SSR-safe (não toca em `window`).
 */
export function buildAuthUrl(base: string, returnTo?: string): string {
  if (!returnTo) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

export const AuthkitConfigContext =
  createContext<ResolvedAuthkitConfig>(DEFAULT_CONFIG);

/** Lê a config resolvida do `<AuthkitProvider>` (ou defaults). */
export function useAuthkitConfig(): ResolvedAuthkitConfig {
  return useContext(AuthkitConfigContext);
}
