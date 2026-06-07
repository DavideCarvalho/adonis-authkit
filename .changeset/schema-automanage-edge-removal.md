---
'@dudousxd/adonis-authkit-server': minor
---

Automatic schema management + admin console is React-only

- **Schema auto-management (default on)**: AuthKit now creates its own tables on boot (`authkit_oidc_payloads`, `auth_settings`, `auth_password_history` and the three organizations tables) and additively adds columns introduced by updates — never drops or alters existing columns. Disable with `schema: { autoManage: false }` and call the new exported `ensureAuthkitSchema(db)` inside a migration you own (idempotent, additive). Runtime settings, password history and organizations now work out of the box.
- **Edge admin console removed**: the React SPA is the only admin console. `admin: { ui: 'edge' }` and the `ui` config field are gone, along with the Edge admin controllers and views (~30 routes). The SPA was already the default; this deletes the parallel legacy surface.
- **`views` autocomplete**: `inertiaRenderer({ views })` is now typed with the `AuthkitScreen` union — IDE autocomplete for every known screen name, still open for custom strings. The array is a set: order never mattered, now the docs say so.
- Fix: packaging import-smoke no longer tries to import the console SPA's Vite bundles in Node.
