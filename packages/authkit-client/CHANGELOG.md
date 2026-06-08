# @dudousxd/adonis-authkit-client

## 0.6.0

### Minor Changes

- 262eb79: Back-Channel Logout pronto para sessões cookie-based + DX do client

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

## 0.5.0

### Minor Changes

- a6ca8a7: Bring your own IdP — use AuthKit against any OIDC-compliant provider
  - **client**: new `discoverEndpoints(issuer)` resolves the IdP's real endpoints from `/.well-known/openid-configuration` (cached per issuer, field-level manual overrides, silent fallback to the oidc-provider conventions when the document is unreachable). All flow helpers (`buildAuthorizeUrl`, `exchangeCode`, `refreshTokens`, `exchangeToken`, `buildEndSessionUrl`) now accept explicit endpoint params — Keycloak, Auth0, Okta, Entra et al. work out of the box.
  - **react**: new `idp: 'authkit' | 'external'` config on `AuthkitProvider`. With an external IdP, the components that depend on authkit-server's REST surface (`UserProfile`, `OrganizationSwitcher`, `OrganizationProfile`, `AuthorizedApps`) degrade to `null` instead of calling endpoints that don't exist; sign-in/out, auth state, role gates and the password strength meter keep working.
  - New "Bring your own IdP" docs page tying the two together.

## 0.4.2

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.4.0

## 0.4.1

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.3.1

## 0.4.0

### Minor Changes

- Round 7 — production pack + multi-tenancy:
  - **Organizations (multi-tenancy)**: optional capability-probed tables (`auth_organizations`, `auth_organization_members`, `auth_organization_invitations`), per-org roles (owner/admin/member), email invitations with hashed tokens, active-org session cookie with `org_id`/`org_slug`/`org_role` claims in id_token/userinfo/JWT access tokens, `/account/orgs` page, admin console section, Admin REST API (`/api/authkit/v1/organizations`), SDK `organizations.*` namespace (remote + embedded), React `useOrganizations`/`useOrganization`/`useSwitchOrganization`/`useOrgInvitations` hooks plus `<OrganizationSwitcher />` and `<OrganizationProfile />` components.
  - **LGPD/GDPR compliance**: self-service and admin account deletion with full cascade (sessions, grants, PATs, passkeys, identities, MFA, avatar) and audit anonymization (stable pseudonym), data export endpoint (`GET /account/security/export`), `login.requireVerifiedEmail` gate across password/magic-link/passkey flows, SDK `users.delete()`.
  - **User migration & password hygiene**: transparent lazy password rehash on login, `password.legacyVerifier` hook for foreign hash formats, `authkit:users:import` ace command (JSON/NDJSON, `--dry-run`), configurable `password.policy`, HaveIBeenPwned k-anonymity breach check (fail-safe), React `usePasswordStrength` + `<PasswordStrengthMeter />`.
  - **JWT access tokens (RFC 9068)**: `accessTokens: { format: 'jwt' }` with per-resource overrides, `verifyJwtAccessToken` local validation in the client package, `authkit:keys:rotate` command with grace-period JWKS rotation.
  - **Bot protection**: pluggable vendor-agnostic `botProtection` config (Turnstile/hCaptcha-ready, fail-safe) on login/signup/reset.
  - **New-device login notification**: `notifications.newDeviceEmail` + `mail.onNewDeviceLogin` hook driven by the trusted-device signal.
  - **Console polish**: session context (user-agent/OS/IP/geo via pluggable `resolveGeo`), RFC 8693 impersonation panel (`admin.impersonation`, default off), dashboard with MAU/daily sign-ins, `GET /api/authkit/v1/stats` + SDK `stats()`.

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.3.0

## 0.3.0

### Minor Changes

- 0c33640: Round 4 — events/webhooks, DPoP client, full e2e harness, polish.

  **server (minor):** add `events` config — observe every audit event in-process (`onEvent`)
  and/or via an HMAC-signed webhook (`x-authkit-signature: sha256=...`, 5s fire-and-forget,
  never throws into the request path). When set, the resolved `audit` sink becomes a fan-out
  (original sink + onEvent + webhook), preserving the admin `list()` query. Also: a full
  interaction e2e harness driving login → consent → token (plus step-up MFA and device-flow
  variants) through the real host controllers, and English `authkit:doctor` messages. Builds on
  the existing consent/account-console, admin user CRUD, profile self-service, trusted-device,
  and passwordless (magic-link / passkey-first) features.

  **client (minor):** add DPoP (RFC 9449) proof generation — `generateDpopKeyPair()` (jose
  ES256, exportable JWK) and `createDpopProof({ key, htm, htu, nonce?, accessToken? })` producing
  a signed `dpop+jwt`, plus `dpopJwkThumbprint()`.

## 0.2.1

### Patch Changes

- Updated dependencies [1872a30]
  - @dudousxd/adonis-authkit-core@0.2.0

## 0.2.0

### Minor Changes

- Refactors do code review (comportamento preservado, contratos mais limpos):

  **server (minor):**
  - `AccountStore` decomposto em interfaces de capacidade (`CoreAccountStore`,
    `MfaCapability`, `WebauthnCapability`, `ProviderIdentityCapability`) com type
    guards (`supportsMfa`/`supportsPasskeys`/`supportsProviderIdentity`). O tipo
    `AccountStore` continua existindo (core & Partial<capacidades>) — compatível.
    `lucidAccountStore` agora OMITE os métodos de capacidades não configuradas em
    vez de lançar em runtime; social login sem provider-identity degrada pro login.
  - Sequência login+lockout centralizada em `attemptPasswordLogin` (era duplicada
    em 2 controllers).
  - `adminGuard` agora retorna 404 quando `admin.enabled: false` (fecha bypass de
    drift entre config e `AuthHostOptions.admin`).
  - `dynamicRegistration.management: true` sem `enabled: true` agora falha no
    resolve do config (RFC 7592 exige 7591).
  - Serialização JSON dos mixins unificada em `jsonColumn()` (semântica por coluna
    preservada).

  **client (minor):**
  - POST ao token endpoint unificado (`exchangeCode`/`refreshTokens`/`exchangeToken`).
  - Introspection + claims→Identity compartilhados entre resolvers; `pat`/`opaque`
    agora também mapeiam `picture→profile.avatarUrl` e `sid→sessionId` (alinhados
    ao `jwt`).

  **react (patch):**
  - Helpers genéricos de roles; warn de dev no `useAuth` quando não há
    `AuthProvider` nem shared prop do Inertia.

## 0.1.1

### Patch Changes

- Corrige os stubs de scaffolding (`node ace configure`):
  - Usa os nomes renomeados dos pacotes (`@dudousxd/adonis-authkit-*`) — antes os
    stubs ainda importavam de `@authkit/*` (inexistente), gerando código quebrado.
  - O model `AuthUser` scaffoldado passa a usar a **conexão default da aplicação**
    (config/database.ts) por padrão, em vez de forçar `static connection = 'auth'`.
    Para isolar o AuthKit num schema/banco dedicado, basta definir a conexão no
    model — documentado no próprio stub. A lib cria as tabelas no banco do app, ou
    onde o dev definir.
