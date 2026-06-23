---
"@adonis-agora/authkit-client": minor
"@adonis-agora/authkit-react": minor
---

Write `globalRoles` into the @agora context from the resolved session (so the Authz global-role bridge can read them), and add Authz permission gating to authkit-react: `useCan(permission, resource?)` and `<CanPermission>`, which consult the Authz `POST <canPath>` endpoint (`{ permission, resource? }` → `{ allowed }`, credentials included) with in-memory caching/dedupe. The endpoint path is configurable via `AuthkitProvider` (`canPath` / `endpoints.can`, default `/authz/can`).
