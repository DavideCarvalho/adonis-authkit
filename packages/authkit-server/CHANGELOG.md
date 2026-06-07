# @dudousxd/adonis-authkit-server

## 0.20.2

### Patch Changes

- fix(sessions): listagem global no console admin quando accountId ausente
  - `ConsoleSessionsController.index`: sem `accountId` retorna lista global de todas as sessões ativas (todas as contas) em vez de 400
  - `AdminSessionsService.listAllSessions()`: enumera todas as sessões via adapter, resolve email por conta com cache (evita N+1), limita a 500 entradas com flag `truncated`
  - `AdminSession`: novo campo opcional `email`
  - `sessionDto`: inclui `email` na projeção JSON
  - `AdminSessionEntry` (react types): campo `email: string | null`
  - `UserSessionsResult` (react types): campo `truncated?: boolean`; renomeia `canList` → `supported` para alinhar com a resposta real do servidor
  - SPA `sessions.containers.tsx`: exibe email acima do accountId na coluna Account quando presente
  - Testes: cobre listagem global, truncamento a 500, capability ausente e resolução de email

## 0.20.1

### Patch Changes

- Fix "Failed to execute 'fetch' on 'Window': Illegal invocation": the typed client stored `globalThis.fetch` unbound and called it as an instance method, losing the Window binding. The default fetch is now bound to `globalThis`. The admin console SPA is also refactored into per-section containers, each with its own loading skeleton and a `react-error-boundary`-backed error state with retry.

## 0.20.0

### Minor Changes

- Typed front-end client, TanStack Query hooks, and account JSON API:
  - **Account self-service JSON API** (`/account/api/*`): session-authed, CSRF-protected endpoints for profile, security overview, password/email change, sessions, authorized apps, MFA/passkeys, PATs and organizations — the data layer for client-side account screens. Login/consent stay postback for security.
  - **Typed front-end client** in `@dudousxd/adonis-authkit-react`: `createAuthkitClient()` (auto-reads `window.__AUTHKIT__`) exposing `client.admin.*` and `client.account.*`, plus `AuthkitClientError`.
  - **TanStack Query hooks** (Tuyau-style): ready-made `use*QueryOptions`/`use*MutationOptions` for every admin and account endpoint, structured `authkitKeys` for invalidation, `AuthkitClientProvider` + `createAuthkitQueryClient()`. `@tanstack/react-query` is a new peer dependency.
  - **Admin console SPA** now consumes these hooks internally (client-side fetching via TanStack Query) instead of a bespoke fetch wrapper.

## 0.19.0

### Minor Changes

- Helpers públicos da sessão do console: `getAccountId(ctx)`, `hasAccountSession(ctx)` e `consoleLoginUrl(returnTo?)` (+ re-export de `ACCOUNT_SESSION_KEY`) — para proteger rotas próprias e integrar pacotes de terceiros (ex.: adonis-telescope) sem depender de detalhes internos.

## 0.18.3

### Patch Changes

- Fix React admin console JSON API returning HTML ("Unexpected token '<'"): the shell catch-all `{prefix}/*` was registered before the `{prefix}/api/*` routes, and AdonisJS matches wildcards by registration order, so the catch-all swallowed every API request and served the HTML shell. The API and asset routes are now registered before the catch-all.

## 0.18.2

### Patch Changes

- Fix React admin console serving the "Build Required" fallback instead of the SPA: the Vite dist was emitted to build/host/ui-dist but the compiled admin_shell_controller (rootDir ./ → build/src/host/admin_console) resolves the dist at build/src/host/ui-dist, so the readFile always failed in production. Vite now outputs to the matching path and the build asserts the dist lands where the controller reads it.

## 0.18.1

### Patch Changes

- Fix boot crash with `admin: { ui: 'react' }`: the React shell was served from two GET routes (`{prefix}` and `{prefix}/*`) sharing the same controller+method, so AdonisJS auto-derived the same route name for both and threw "A route with name console_shell.serve already exists" at boot. The shell, asset and catch-all routes now carry explicit unique names.

## 0.18.0

### Minor Changes

- Rodauth parity completion + React admin console:
  - **Sudo mode**: `sudo_mode` setting + `/account/confirm` (password or passkey) re-confirmation with a grace window; `requireSudo` gates password/email change, account deletion, MFA/passkey management and PAT actions.
  - **OTP lockout**: `otp_lockout` setting locks the second factor after repeated TOTP/recovery failures and unlocks via emailed link (`GET /auth/otp-unlock/:token`, `onOtpUnlock` hook).
  - **Common-password block**: `password_policy.blockCommon` (default on) rejects the ~10k most common passwords offline, before the HIBP check.
  - **Account expiration**: `account_expiration` setting blocks login for accounts inactive beyond N days (reactivate via password reset) + `authkit:accounts:expire-scan` command for cron with warning emails.
  - **WebAuthn autofill**: `auth_methods.passkeyAutofill` enables conditional-mediation passkey suggestions on the login field; new `usePasskeyAutofill` React hook.
  - **React admin console (new default)**: `admin: { ui: 'react' }` serves a real Vite-built React SPA (build-and-serve, bundled in the package — zero host setup) with a dark/light telescope-style theme, consuming a session-authed JSON API under `{prefix}/api/*`. `ui: 'edge'` keeps the classic server-rendered console.

## 0.17.1

### Patch Changes

- Fix broken console templates in 0.17.0: the styles partial `@include` shared a line with `</head>`, which the Edge lexer cannot tokenize — every console page crashed. Do not use 0.17.0.

## 0.17.0

### Minor Changes

- Console UX:
  - **`return_to` on console login**: the account/admin guards now redirect to `/account/login?return_to=<original path>` and the login POST sends you back where you were heading (server-side validated, open-redirect proof). Custom login pages receive a `returnTo` prop and should propagate it as a hidden input.
  - **Roles catalog**: new `/admin/roles` page manages the global-role catalog (runtime setting `roles_catalog`; ADMIN is protected). The users page assigns roles via checkboxes from the catalog instead of free text; roles a user holds that left the catalog show an "out of catalog" badge and can only be removed. Doctor warns when `admin.roles` references a role missing from the catalog.

### Patch Changes

- 55eb9d7: Elimina o FOUC (flash de página sem estilo) em todas as telas server-rendered do host (login, account, console admin): o Tailwind Play CDN (gerava CSS em runtime no browser) foi substituído por CSS estático gerado no build e embutido inline via partial Edge.

## 0.16.0

### Minor Changes

- Breaking cleanup (0.x, no external consumers): every deprecation shim is gone.
  - Policy now lives ONLY in runtime settings (DB) with library defaults — removed from config: static `clients`, lockout policy fields (`store` stays), rate-limit buckets (`enabled`/`store` stay), `notifications`, trusted-devices `enabled`/`days`, `admin.impersonation`, organizations `roles`/`allowSelfCreate`/`invitationTtlHours`, and `password.policy`/`password.checkPwned` store options (`legacyVerifier`/`pepper`/`pwnedTimeoutMs` stay — they are code/infra).
  - Removed commands `authkit:clients:import` and the legacy `authkit:rotate-keys` alias. New `authkit:clients:create` creates OIDC clients programmatically through the configured storage (confidential secret printed once; `--public`, repeatable `--redirect-uri`/`--grant`, `--json`).
  - Removed the no-op `passthroughParsed` option from `jsonColumn` and the `checkLegacyPolicyConfig` doctor check.

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.4.0

## 0.15.2

### Patch Changes

- Fix RuntimeSettings against a real Lucid database: queries used `db.table()` (Lucid's INSERT query builder) for SELECT/DELETE, so the table probe always failed and every runtime setting reported "table absent" on real hosts. Reads/deletes now use `db.from()`; verified end-to-end against Postgres on a named connection.

## 0.15.1

### Patch Changes

- RuntimeSettings now probes the `auth_settings` table with a real `SELECT` (search_path-aware) instead of `schema.hasTable`, and follows the account store's named connection (`lucidAccountStore` exposes `connectionName` from the model). Hosts storing auth on a named connection (e.g. `connection: 'auth'`) no longer see every runtime setting as "table absent".

## 0.15.0

### Minor Changes

- Rodauth parity + runtime-first management:
  - **Verified email change** (`verify_login_change`): logged-in users change their email with confirmation sent to the NEW address and a security warning to the CURRENT one; cancellable, hashed tokens, `email_change` runtime setting, `onEmailChangeConfirm`/`onEmailChangeNotice` mail hooks.
  - **Security notification emails**: automatic notices for password changed, MFA enabled/disabled, passkey added/removed and email changed — `security_notifications` setting, `onSecurityNotice` hook overrides defaults.
  - **Advanced password hygiene**: password reuse history (optional `auth_password_history` table + `password_history` setting), password pepper (`password.pepper: string | string[]` with rotation and lazy re-hash), password expiration (optional `password_changed_at` column + forced change step at login), email-verification grace period (`require_verified_email.graceDays`).
  - **Session policies** (`session_policy` setting): explicit remember-me checkbox backed by oidc-provider transient sessions + runtime TTL holder, single-session enforcement (revokes other sessions on login), idle timeout for the account/admin consoles.
  - **Runtime-first management**: 18 runtime setting keys are now the single source of policy (setting > legacy config fallback > library default) — lockout, rate-limit buckets, password policy/HIBP, notifications, trusted devices, token TTLs (live via holder), admin impersonation and organizations policy join the existing toggles; legacy config policy fields are deprecated (kept as fallback) and reported by the new doctor check; new `authkit:settings:list|get|set|unset` ace commands write through the configured storage; the admin settings page is organized into sections.

## 0.14.0

### Minor Changes

- Render seam hardening for SSR hosts:
  - **Admin console always renders the built-in edge views** — the management area is library chrome, never routed through the host's custom renderer (custom-rendered hosts were 500ing on `/admin` because no `admin/*` pages exist on the host).
  - **`inertiaRenderer({ prefix, views?: string[] })`**: with the new `views` allowlist only listed screens go through Inertia; everything else silently falls back to the built-in edge views instead of crashing SSR with "Cannot read properties of undefined (reading 'default')" when the host page doesn't exist. Omitting `views` keeps the previous behavior. The react configure stub now scaffolds the allowlist.

## 0.13.1

### Patch Changes

- Fix Postgres json/jsonb columns crashing model hydration: `jsonColumn`'s `consume` blindly `JSON.parse`d every value, but Postgres drivers return json/jsonb columns already deserialized (objects/arrays) — hydrating `global_roles` blew up with `"[object Object]" is not valid JSON` (500 on the admin console right after login). `consume` now passes non-strings through, parses strings, and falls back safely on invalid JSON. The `passthroughParsed` option is deprecated (always on).

## 0.13.0

### Minor Changes

- Configurable Admin REST API prefix: `registerAuthHost(router, { adminApi: { prefix: '/authkit/api' } })` mounts the API under a custom prefix (default `/api/authkit/v1` unchanged; `adminApi: true` keeps working). The SDK remote driver gains a matching `apiPrefix` option in `createAuthkit`.

## 0.12.0

### Minor Changes

- Embedding & login-surface control:
  - **Configurable admin console prefix**: `registerAuthHost(router, { admin: { prefix: '/auth/admin' } })` mounts every console route, view link and redirect under a custom prefix (default `/admin`; `admin: true` unchanged). Admin REST API path is unaffected.
  - **`auth_methods` runtime setting**: choose from the admin UI which login methods the screens offer — password, magic link, passkey and which configured social providers. `forgotPassword` is auto-derived (no password method → no forgot-password link/endpoints), the social list intersects with code-configured providers, and an all-off setting fail-safes back to config defaults. New "Authentication methods" card in `/admin/settings` with dependency hints, plus doctor checks.

## 0.11.2

### Patch Changes

- `authkit:doctor` jwks check now reads the input shape (`jwksConfig`) instead of the materialized keyset, restoring the "managed without store = ephemeral key per boot" warning on resolved configs.

## 0.11.1

### Patch Changes

- Fix ace commands reading the raw config provider: `authkit:doctor`, `authkit:users:import`, `authkit:keys:rotate` and the legacy `authkit:rotate-keys` read `config.get('authkit')` directly, which returns the UNRESOLVED config provider that `defineConfig` exports — so every field (issuer, accountStore, jwks) looked missing against a perfectly valid host config. The commands now resolve the provider via the new `resolveAuthkitConfig` helper (plain-object configs still pass through). The resolved config also gains `jwksConfig`, an echo of the jwks INPUT shape (source/store/algorithm), since the resolved `jwks` is the materialized keyset and loses those fields needed by key rotation.

## 0.11.0

### Minor Changes

- Runtime-first administration:
  - **Three new runtime toggles** (auth_settings-backed, with admin console cards showing effective state): `registration` (open/close self-service signup without affecting org invites or admin-created users; static fallback `registration.enabled`), `require_verified_email` (overrides `login.requireVerifiedEmail` across password/magic-link/passkey flows), and `maintenance_mode` (`{ enabled, message? }` — blocks login/signup/forgot for non-admins with a maintenance page while admin accounts keep logging in; userinfo/introspection/existing sessions keep working; the Admin API is never blocked, providing a guaranteed escape hatch). Audit events `maintenance.enabled`/`maintenance.disabled`.
  - **Clients are now managed at runtime** (admin console + Admin REST API are the canonical path): the static `clients` config field is optional and deprecated (boot warning, doctor warning, console banner). New `authkit:clients:import` ace command (`--dry-run`) migrates config clients to the adapter preserving secrets and skipping existing ones. Booting with zero configured clients is fully supported. New doctor check warns when clients live in a volatile adapter. Backchannel logout URI/session-required are now editable via console and API.

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.3.1

## 0.10.0

### Minor Changes

- Runtime settings + bot protection UI toggle:
  - **Runtime settings store**: optional capability-probed `auth_settings` table with `SettingsCapability`, `supportsSettings` type guard and a `RuntimeSettings` service (15s TTL cache, fail-safe fallback to static config on any DB error or missing table).
  - **Bot protection runtime toggle**: the `bot_protection` setting key (`{ enabled, on? }`) turns bot protection on/off and overrides protected actions without redeploying — the `verify` hook still comes from config (it is code). No setting/table = static config, zero breaking changes.
  - **Admin console**: new `/admin/settings` page with the bot-protection card (toggle + action checkboxes, disabled state when `verify` is not configured, schema hint when the table is absent). Audit event `settings.updated`.
  - **Admin REST API**: `GET/PUT/DELETE /api/authkit/v1/settings[/:key]` (404 when capability absent).
  - **SDK**: `authkit.settings.list()/get()/set()/delete()` in both remote and embedded drivers.
  - **Doctor**: `checkSettings` warns about an orphan `bot_protection` setting when `botProtection.verify` is absent from config.

## 0.9.0

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

## 0.8.0

### Minor Changes

- 93bfc4f: Admin REST API (/api/authkit/v1) com API keys — base do SDK

## 0.7.0

### Minor Changes

- 40c7737: Avatar upload no console de conta via o `@adonisjs/drive` do app (config `uploads.avatars`). Por padrão usa o disk default do app, diretório `authkit/avatars`, até 5MB; sobreponível por disk/directory/maxSizeMb. Loader lazy e fail-safe: sem o drive instalado/configurado a feature degrada para o input de URL e o input de arquivo é escondido. Aceita jpg/jpeg/png/webp; tipo/tamanho inválidos flasham erro i18n (EN+PT). Audita `profile.updated` com `{ via: 'upload' | 'url' }`.

## 0.6.0

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

## 0.5.0

### Minor Changes

- 687501c: Built-in UI strings now default to English; pt-BR ships as a built-in locale (`i18n: { locale: 'pt-BR' }`). BREAKING-ish for hosts relying on pt-BR defaults: set the locale explicitly.

## 0.4.0

### Minor Changes

- Console completo + protocolo: sessões/grants ativos com revogação no admin,
  troca de senha/e-mail self-service, alerta de login de IP novo; Device
  Authorization Grant (RFC 8628), DPoP, PAR e step-up acr/MFA; `authkit:doctor`
  e `authkit:rotate-keys` (keystore de JWKS com rotação).
- 1872a30: DX & ops infra:
  - New package `@dudousxd/adonis-authkit-testing` — test helpers for host apps:
    `createTestIdentity`, `mintTestIdToken` + `serveJwks`/`testJwks`/`jwksFromKey`
    (real RS256 tokens validated by a local JWKS), `fakeAuthenticator`, and a
    capability-aware `fakeAccountStore`.
  - `node ace authkit:doctor` — validates host config and prints ✅/⚠️/❌ findings
    (issuer/mountPath, clients, accountStore capabilities, session, shield, ally,
    rate-limit, admin, webauthn, jwks). Non-zero exit on errors.
  - `node ace authkit:rotate-keys` — rotates managed JWKS signing keys via a new
    file-backed keystore (`jwks: { source: 'managed', store }`), keeping the last
    N public keys so pre-rotation tokens still verify.

### Patch Changes

- Updated dependencies [1872a30]
  - @dudousxd/adonis-authkit-core@0.2.0

## 0.3.0

### Minor Changes

- Console admin (B6): CRUD de clients OIDC armazenados no adapter (DB-backed).
  `/admin/clients` agora cria/edita/deleta clients dinâmicos (client_id/secret
  gerados, secret exibido uma única vez, regenerate-secret, redirect/grants/auth
  method editáveis), além de listar os estáticos do config (read-only). Adapter
  ganha `listClients?()` opcional (implementado no database e redis via SCAN; UI
  degrada graciosamente quando não suportado). Cache de clients do oidc-provider
  invalidado a cada escrita. Novos audit events `client.created/updated/deleted`.

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
