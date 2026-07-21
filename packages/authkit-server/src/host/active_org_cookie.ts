import type { ActiveOrgInfo } from '../accounts/account_store.js';

/** Nome do cookie da org ativa. HttpOnly, SameSite=Lax, Secure em prod. */
export const ACTIVE_ORG_COOKIE = 'authkit_active_org';

/** TTL máximo do cookie da org ativa (30 dias em segundos). */
export const ACTIVE_ORG_COOKIE_TTL = 60 * 60 * 24 * 30;

/**
 * Codifica as informações da org ativa num valor de cookie (plaintext, sem
 * assinatura — a assinatura fica a cargo do jar de cookies do AdonisJS/Keygrip
 * via o próprio cookie signed). Formato: `orgId\torgSlug\torgRole`.
 * TAB é escolhido pois IDs e slugs não o contêm.
 */
export function encodeActiveOrgCookie(info: ActiveOrgInfo): string {
  return `${info.orgId}\t${info.orgSlug}\t${info.orgRole}`;
}

/**
 * Decodifica o valor cru do cookie. Retorna `null` se o formato for inválido.
 * Não valida assinatura — assume que o caller já verificou (AdonisJS request.cookiesList).
 */
export function decodeActiveOrgCookie(value: string | null | undefined): ActiveOrgInfo | null {
  if (!value) return null;
  const parts = value.split('\t');
  if (parts.length !== 3) return null;
  const [orgId, orgSlug, orgRole] = parts;
  if (!orgId || !orgSlug || !orgRole) return null;
  return { orgId, orgSlug, orgRole };
}

/**
 * Lê a org ativa de um contexto Koa (oidc-provider). O oidc-provider usa o Keygrip
 * das `cookieKeys` para assinar os cookies — lemos via `ctx.cookies.get(name, { signed: false })`
 * (o oidc-provider não assina cookies da aplicação; apenas verifica os seus). A
 * validação de assinatura para este cookie de aplicação é feita no controller AdonisJS
 * ao gravar (via `ctx.response.cookie` com `signed: true`). Aqui fazemos best-effort:
 * se o valor estiver presente e parseable, usamos; caso contrário retorna null.
 *
 * NOTA: o oidc-provider ctx.cookies.get() nunca lança — retorna null se ausente.
 */
export function readActiveOrgFromKoaCtx(koaCtx: any): ActiveOrgInfo | null {
  try {
    const raw = koaCtx?.cookies?.get?.(ACTIVE_ORG_COOKIE, { signed: false });
    return decodeActiveOrgCookie(raw);
  } catch {
    return null;
  }
}
