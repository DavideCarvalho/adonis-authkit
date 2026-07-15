---
"@adonis-agora/authkit-server": patch
---

Default `render` to `edgeRenderer()` when `config/authkit.ts` omits it. Previously `render` had no runtime default: every `/account/*` and `/auth/interaction/*` request would throw `TypeError: render is not a function` (a 500 with no explanation) the moment a controller called `cfg.render!(...)`.
