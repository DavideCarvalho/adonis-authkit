---
'@adonis-agora/authkit-server': minor
---

The admin console now resolves an account's roles through `resolveTokenRoles` when configured — the same source the OIDC `roles` claim is minted from — so an app-role admin (e.g. one whose roles live in a `@adonis-agora/authz` table) reaches the console without needing the role duplicated in `auth.users.global_roles`. Applies to the `adminGuard` route gate and the console shell's current-user display. Default is unchanged: with no `resolveTokenRoles` configured, both fall back to `account.globalRoles`.
