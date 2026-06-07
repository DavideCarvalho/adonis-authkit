---
'@dudousxd/adonis-authkit-server': patch
---

New `accountHome` config — and the account area no longer dumps users on the PAT screen

Post-login at `/account/login` (without `return_to`), e-mail confirmations, and non-admin redirects away from the console used to land on `/account/tokens` (the Personal Access Tokens screen) — hostile for regular users. The default destination is now **`/account/security`** and is configurable via `accountHome` in `defineConfig` (point it at your app's home to land users straight in the product).
