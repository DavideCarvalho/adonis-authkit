---
"@adonis-agora/authkit-react": minor
---

`authkit-react` drops app-role/authorization gating — that concern moved to
`@adonis-agora/authz-react`.

Removed:
- `AuthUser.appRoles`, `AuthSharedProps.authkit.appRoles`.
- `AuthState.appRoles`/`AuthState.hasAppRole()`.
- `hasAppRole`, `hasAnyAppRole`, `hasAllAppRoles` (from `roles.ts` and the package barrel).
- The `<Can>` component (`components/can.tsx`) and its `CanProps` type — it now lives in
  `@adonis-agora/authz-react`, backed by the Authz service instead of app roles resolved
  on the host.

`AuthState` is now `{ user, isAuthenticated, globalRoles, hasGlobalRole, hasAnyGlobalRole,
hasAllGlobalRoles }`.

Kept: `user`, `globalRoles`, `hasGlobalRole`/`hasAnyGlobalRole`/`hasAllGlobalRoles` — these
read from the IdP token via `@adonis-agora/authkit-client`, not from app-defined roles.
`<CanPermission>`/`useCan` (permission checks against the Authz `/authz/can` endpoint) are
unaffected.
