import type { AuthAccount } from '../accounts/account_store.js';

/** The slice of the resolved config the role resolution needs (structurally typed). */
type RoleResolverConfig = {
  resolveTokenRoles?: (
    account: AuthAccount,
    context: {
      clientId?: string;
      activeOrg?: { orgId: string; orgSlug: string; orgRole: string } | null;
    },
  ) => string[] | Promise<string[]>;
};

/**
 * An account's effective roles for host-side gating (the admin console).
 *
 * When the host configures `resolveTokenRoles`, that hook is the single source of an account's roles
 * — the same one the OIDC `roles` claim is minted from — so console access tracks the host's role
 * authority (e.g. an app that keeps roles in its own table via `@adonis-agora/authz`) instead of the
 * account's stored `globalRoles`. Falls back to `account.globalRoles ?? []` when no hook is set, so
 * default behavior is unchanged.
 *
 * The console is not OIDC-client- or org-scoped for role purposes, so the hook is called with an
 * empty context (`clientId: undefined`, `activeOrg: null`).
 */
export async function resolveAccountRoles(
  cfg: RoleResolverConfig,
  account: AuthAccount,
): Promise<string[]> {
  if (cfg.resolveTokenRoles) {
    return cfg.resolveTokenRoles(account, { clientId: undefined, activeOrg: null });
  }
  return account.globalRoles ?? [];
}
