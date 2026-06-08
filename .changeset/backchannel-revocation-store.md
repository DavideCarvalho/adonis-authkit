---
'@dudousxd/adonis-authkit-client': minor
'@dudousxd/adonis-authkit-server': minor
---

Back-Channel Logout pronto para sessões cookie-based + DX do client

Antes, fechar o gap de logout SSO em sessão cookie-based exigia escrever model + service + middleware à mão em cada app (e era fácil esquecer — deixando a sessão válida por até 30 dias após um logout SSO). Agora o AuthKit absorve isso:

**`@dudousxd/adonis-authkit-client`**
- `lucidRevocationStore({ connection?, table? })` + interface `RevocationStore`: persistência append-only de revogações (sid/sub/revoked_at), sem precisar declarar model.
- `BackchannelRevocationMiddleware` (subpath `/backchannel_revocation_middleware`): derruba a sessão revogada na próxima request.
- `defineConfig({ backchannelLogout: { store } })`: deriva o `onBackchannelLogout` e expõe o store ao middleware.
- `lucidMirror(Model, { sync, preload, injectGlobalRoles })`: factory do `resolveUser` "espelho local".
- Middlewares prontos `auth_middleware` (com `roles`) e `silent_auth_middleware` (subpaths).
- `buildAuthorizeUrl({ extraParams })`: anexa `audience`/`prompt`/`login_hint`/etc. sem manipular URL na mão.
- `Authenticator.toSharedProps()`: `{ user, globalRoles, appRoles, abilities }` pronto p/ Inertia share.
- `AuthkitClientManager.impersonate()` / `stopImpersonating()` / `isImpersonating()`: ciclo de impersonação (RFC 8693) gerenciado.

- `registerOidcClient(router, { redirects, afterLogin, loginMiddleware })`: registra login/callback/logout (+back-channel) absorvendo PKCE/state/exchange/redirect-por-papel do OidcSessionController.

**`@dudousxd/adonis-authkit-server`**
- Tabela `auth_session_revocations` gerenciada pelo `ensureAuthkitSchema()` (schema auto-manage) — compartilhável entre apps no mesmo banco.
- Revogação em massa do admin (`AdminSessionsService.revokeAll`) grava uma revogação `sub` na tabela compartilhada → logout INSTANTÂNEO nos clients cookie-based (antes esperava o refresh token falhar, ~TTL do access token).
- **Config locks (BREAKING semântico):** settings definidas no `defineConfig` ficam TRAVADAS — config vence e a UI/Admin API não pode alterá-las (`getSetting` → null p/ resolvers caírem no config; `setSetting`/`deleteSetting` → 423 `SettingLockedError`). O console mostra badge "definido via config" e desabilita o controle. Exports: `isSettingLocked`, `lockedSettingKeys`, `deriveLockedSettingKeys`, `SettingLockedError`.
- **`encrypter` do TOTP agora é DEFAULT (BREAKING):** `lucidAccountStore` encripta o segredo TOTP com `APP_KEY` por padrão (`appKeyEncrypter()`); `encrypter: false` desliga. ⚠️ Segredos gravados em claro por versões anteriores deixam de decriptar — migre ou passe `false`.
- `jwks: 'auto'` — resolve env-aware (`AUTHKIT_JWKS` inline, senão managed em arquivo); elimina o ternário no config.
- `adminApi.apiKeys: 'env'` (lê `AUTHKIT_ADMIN_API_KEY`) + `enabled` auto quando há key — elimina o spread condicional.
- `lucidStores({ account, pat, audit, providerIdentity, webauthnCredential, organizations }, { mfaIssuer, webauthn })`: monta os stores declarando mfaIssuer/webauthn UMA vez.
- `defineConfig` reusa `mfaIssuer`/`webauthn` do `lucidAccountStore` quando o top-level não os fornece (declare uma vez).
- `authkitCsrfExceptions(url, { mountPath })`: helper de isenção CSRF das rotas machine-to-machine.
- **`registerAuthHost(router)` sem opts** — lê mountPath/social/rateLimit/admin/adminApi do `config/authkit.ts` (stash no boot do provider, que roda antes do preload do routes.ts). Acaba com o drift config↔registerAuthHost; `opts` viram só override (ex.: `{ admin: { prefix } }`). Fallback p/ defaults quando não há stash (testes).
