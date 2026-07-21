import type { Identity } from '@adonis-agora/authkit-core';

/**
 * Ponte estrutural (best-effort) entre a sessão resolvida do authkit e o
 * contexto do Agora. Lê o slot global `@agora/context:set` de forma ESTRUTURAL —
 * nunca importa `@adonis-agora/context` — e degrada para no-op quando o context
 * não está instalado. Mesmo idioma da `diagnostics_bridge`.
 */
const SET_SLOT = Symbol.for('@agora/context:set');

type SetFn = (patch: {
  userRef?: { type: string; id: string };
  tenantId?: string;
  globalRoles?: string[];
  [k: string]: unknown;
}) => void;

/**
 * Claims OIDC candidatas a "organização/tenant ativo". A primeira presente (e
 * string não vazia) vira o `tenantId`. Não falha se nenhuma existir.
 */
const TENANT_CLAIMS = [
  'active_organization_id',
  'org_id',
  'organization_id',
  'tenant_id',
  'tid',
] as const;

/** Deriva o tenant ativo das claims cruas, ou `undefined` quando ausente. */
function deriveTenant(raw: Record<string, unknown> | undefined): string | undefined {
  if (!raw) return undefined;
  for (const claim of TENANT_CLAIMS) {
    const value = raw[claim];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Popula o contexto do Agora a partir de uma identidade recém-resolvida:
 * `userRef` ({ type: 'user', id: userId }), os `globalRoles` da identidade e,
 * quando presente nas claims, `tenantId`. Best-effort: qualquer erro é engolido
 * e nada acontece sem o slot.
 */
export function populateContext(identity: Identity): void {
  try {
    const set = (globalThis as Record<symbol, unknown>)[SET_SLOT] as SetFn | undefined;
    if (!set) return;
    const tenant = deriveTenant(identity.raw);
    set({
      userRef: { type: 'user', id: identity.userId },
      globalRoles: identity.globalRoles,
      ...(tenant ? { tenantId: tenant } : {}),
    });
  } catch {
    // best-effort: a ponte de contexto nunca quebra o caminho da request.
  }
}
