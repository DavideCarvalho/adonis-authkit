---
'@dudousxd/adonis-authkit-server': patch
---

Admin console: finish the nuqs URL-state migration and pin SPA deps

- **nuqs URL state now covers every page.** The Audit and Sessions pages join Users and Orgs in keeping navigation and filter state (page, type filter, pagination) in the query string via [nuqs](https://nuqs.47ng.com/)'s generic React adapter — completing the migration shipped in 0.25.0. Every view + filter combination is deep-linkable and survives refresh; switching pages clears shared filter params so state never leaks between views. Ephemeral UI (modals/forms) stays in React state.
- **Per-user "Disconnect all devices"** (shipped in 0.25.0, now documented): the admin user drawer's Actions row revokes a single user's sessions + grants via `POST {prefix}/api/users/:id/revoke-sessions` — the admin-side equivalent of the self-service "Sign out of all devices" on `/account/security`.
- **Pinned SPA dependencies** to exact versions: `nuqs@2.8.9` and `recharts@3.8.1` (no `^` range).
