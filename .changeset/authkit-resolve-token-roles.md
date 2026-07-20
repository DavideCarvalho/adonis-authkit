---
"@adonis-agora/authkit-server": minor
---

Add a pluggable `resolveTokenRoles` hook to source the global-roles claim from an external authority (e.g. `@adonis-agora/authz`) or a custom store at token-mint time. Applies to both the authorization-code flow (first-party only) and token exchange. Default unchanged (`account.globalRoles`).
