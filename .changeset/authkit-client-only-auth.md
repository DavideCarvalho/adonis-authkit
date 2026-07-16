---
"@adonis-agora/authkit-client": minor
---

`authkit-client` now only authenticates — app-role/authorization concerns moved out to
`@adonis-agora/authz`.

Removed:
- `AuthenticatorDeps.resolveAppRoles`, `Authenticator.hasAppRole`/`getAppRoles`.
- `appRoles`/`abilities` from `Authenticator.toSharedProps()` — it now returns
  `{ user, globalRoles }`.
- `ClientConfigInput.resolveAppRoles`/`ResolvedClientConfig.resolveAppRoles` (`defineConfig`).
- `AuthMiddlewareOptions.roles`/`unauthorizedRedirect` — the built-in `auth_middleware` now only
  requires a valid session (redirects to `options.redirectTo ?? '/auth/login'` when absent). Use
  `@adonis-agora/authz` (or Bouncer) on the route for role/permission gating.
- `PostLoginRedirects.byAppRole` in `registerOidcClient` — `byGlobalRole` (claims from the token)
  and `default` still work; the `resolveDestination` helper no longer takes an `authenticator`.

Kept: `hasGlobalRole`, `getIdentity` (still populates the Agora context), `getUser`,
`authenticate`, `check` — these read from the token/session, not from app-defined roles.
