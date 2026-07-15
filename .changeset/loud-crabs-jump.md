---
"@adonis-agora/authkit-server": patch
---

Fail fast and loudly at boot when `config/app.ts` is missing `appKey`, instead of only surfacing a `RuntimeException` lazily the first time something resolves the `authkit.server` binding (which could otherwise be silently swallowed by the keystore-reload poller/key-rotation scheduler's fail-safe `.catch(() => null)`, or surface as an unexplained 500 on the first `/account/*` request).
