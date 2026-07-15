---
"@adonis-agora/authkit-server": minor
---

Add optional `@adonisjs/auth` integration. `authkitUserProvider()` plugs authkit's own `accountStore` into `@adonisjs/auth`'s `sessionGuard()` (for `config/auth.ts`), and a new `adonisAuth: { guard: '...' }` option in `config/authkit.ts` makes `AccountSessionController#login`/`logout` (and the other self-service logout endpoints) also call `ctx.auth.use(guard).login()/.logout()` — so `ctx.auth.user`, `middleware.auth()`, and Bouncer's `() => ctx.auth.user` now work for apps built on authkit. Fully opt-in and additive: `ctx.auth` is never touched unless both the guard is configured in `config/authkit.ts` and `@adonisjs/auth` is actually installed and initialized.
