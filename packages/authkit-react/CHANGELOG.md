# @dudousxd/adonis-authkit-react

## 0.7.0

### Minor Changes

- feat(settings): org-scoped runtime settings (org → global → default resolution)
  - `auth_settings` table gains `organization_id` column (nullable; NULL = global). Unique constraint on (key, organization_id).
  - `RuntimeSettings` methods gain optional `orgId` param: `getSetting(key, orgId?)`, `setSetting(key, value, updatedBy?, orgId?)`, `deleteSetting(key, orgId?)`, `listSettings(orgId?)`. New `getEffective(key, orgId?)` helper resolves org → global → null.
  - Cache is org-scope-aware (cache key includes orgId).
  - `resolveEffectiveOrganizationsPolicy` and `resolveEffectiveRolesCatalog` accept optional `orgId` and resolve org → global → default. All other resolvers remain global-only.
  - Console JSON API (`/api/settings`) and Admin REST API accept `?organizationId=` query param for scoped reads/writes/deletes.
  - Org detail drawer in console admin shows "Organization Settings" section for org-scopable keys (`organizations_policy`, `roles_catalog`) with source badges (from org / from global / default) and inline JSON editor.
  - `@dudousxd/adonis-authkit-react` client: `settings.list(orgId?)`, `settings.set(key, value, orgId?)`, `settings.remove(key, orgId?)`. `authkitKeys.admin.settings(orgId?)`. `useSettingsQueryOptions(orgId?)`, `useSetSettingMutationOptions(orgId?)`, `useRemoveSettingMutationOptions(orgId?)`.
  - `SettingEntry` type gains `organizationId: string | null` field.
  - Existing rows default to `organization_id = NULL` (global) — no data migration needed.

## 0.6.0

### Minor Changes

- feat(console): gestão completa de organizations no console admin React

  Adiciona CRUD completo de organizações na JSON API do console React
  (console_orgs_controller) e na SPA (Orgs.tsx + orgs.containers.tsx):

  **Novos endpoints no console React JSON API (`{adminPrefix}/api/orgs/*`):**
  - `POST   /api/orgs` → criar org (name + slug + ownerAccountId)
  - `PATCH  /api/orgs/:id` → editar nome/logo
  - `DELETE /api/orgs/:id` → remover org
  - `POST   /api/orgs/:id/members` → adicionar membro (accountId + role)
  - `PATCH  /api/orgs/:id/members/:accountId` → alterar role do membro
  - `DELETE /api/orgs/:id/members/:accountId` → remover membro
  - `POST   /api/orgs/:id/invitations` → criar convite (email + role)
  - `DELETE /api/orgs/:id/invitations/:invitationId` → revogar convite

  Todos os endpoints retornam 404 `capability_unsupported` quando o store não
  suporta organizações. Lógica reutiliza `AdminOrgsService` (sem duplicação).

  **SDK `@dudousxd/adonis-authkit-react`:**
  - `client.admin.orgs`: novos métodos `addMember`, `removeMember`,
    `updateMemberRole`, `createInvitation`, `revokeInvitation`
  - Novos hooks: `useAddOrgMemberMutationOptions`, `useRemoveOrgMemberMutationOptions`,
    `useUpdateOrgMemberRoleMutationOptions`, `useCreateOrgInvitationMutationOptions`,
    `useRevokeOrgInvitationMutationOptions`

  **SPA do console:**
  - Botão "New organization" na header (modal com name + slug auto-gerado + ownerAccountId)
  - Empty state com CTA de criar
  - Drawer da org: editar nome/logo, deletar (com confirmação), listar membros com
    add/mudar-role/remover, convites pendentes com criar e revogar
  - Padrão containers + skeleton + QueryBoundary + toasts

  i18n: strings em inglês (interface do console); mensagens de erro do servidor em pt-BR.

## 0.5.3

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

## 0.5.2

### Patch Changes

- Fix SSR crash (500) when host React account screens use the client: the constructor threw an SSR error eagerly, breaking server-render of any page that only uses `client.account.*`. Construction is now side-effect-free; the admin base is resolved lazily and only throws if an `admin.*` call is actually made without a base. Account-only screens work with just `accountBaseUrl`.

## 0.5.1

### Patch Changes

- Fix "Failed to execute 'fetch' on 'Window': Illegal invocation": the typed client stored `globalThis.fetch` unbound and called it as an instance method, losing the Window binding. The default fetch is now bound to `globalThis`. The admin console SPA is also refactored into per-section containers, each with its own loading skeleton and a `react-error-boundary`-backed error state with retry.

## 0.5.0

### Minor Changes

- Typed front-end client, TanStack Query hooks, and account JSON API:
  - **Account self-service JSON API** (`/account/api/*`): session-authed, CSRF-protected endpoints for profile, security overview, password/email change, sessions, authorized apps, MFA/passkeys, PATs and organizations — the data layer for client-side account screens. Login/consent stay postback for security.
  - **Typed front-end client** in `@dudousxd/adonis-authkit-react`: `createAuthkitClient()` (auto-reads `window.__AUTHKIT__`) exposing `client.admin.*` and `client.account.*`, plus `AuthkitClientError`.
  - **TanStack Query hooks** (Tuyau-style): ready-made `use*QueryOptions`/`use*MutationOptions` for every admin and account endpoint, structured `authkitKeys` for invalidation, `AuthkitClientProvider` + `createAuthkitQueryClient()`. `@tanstack/react-query` is a new peer dependency.
  - **Admin console SPA** now consumes these hooks internally (client-side fetching via TanStack Query) instead of a bespoke fetch wrapper.

## 0.4.0

### Minor Changes

- Rodauth parity completion + React admin console:
  - **Sudo mode**: `sudo_mode` setting + `/account/confirm` (password or passkey) re-confirmation with a grace window; `requireSudo` gates password/email change, account deletion, MFA/passkey management and PAT actions.
  - **OTP lockout**: `otp_lockout` setting locks the second factor after repeated TOTP/recovery failures and unlocks via emailed link (`GET /auth/otp-unlock/:token`, `onOtpUnlock` hook).
  - **Common-password block**: `password_policy.blockCommon` (default on) rejects the ~10k most common passwords offline, before the HIBP check.
  - **Account expiration**: `account_expiration` setting blocks login for accounts inactive beyond N days (reactivate via password reset) + `authkit:accounts:expire-scan` command for cron with warning emails.
  - **WebAuthn autofill**: `auth_methods.passkeyAutofill` enables conditional-mediation passkey suggestions on the login field; new `usePasskeyAutofill` React hook.
  - **React admin console (new default)**: `admin: { ui: 'react' }` serves a real Vite-built React SPA (build-and-serve, bundled in the package — zero host setup) with a dark/light telescope-style theme, consuming a session-authed JSON API under `{prefix}/api/*`. `ui: 'edge'` keeps the classic server-rendered console.

## 0.3.2

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies
  - @dudousxd/adonis-authkit-core@0.3.1

## 0.3.0

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

## 0.2.0

### Minor Changes

- 0403b72: Add a Clerk-style frontend layer: an `<AuthkitProvider>` config context (loginUrl/logoutUrl/profileUrl/endpoints/csrfToken with host-kit defaults), headless hooks (`useSignIn`, `useSignOut`, `useUser`, `useProfile`, `useSessions`, `useAuthorizedApps` — fetch-based, no react-query), and pre-built themeable components (`SignInButton`, `SignOutButton`, `UserButton`, `UserProfile`, `AuthorizedApps`, `Avatar`) with a shipped `styles.css` (`./styles.css` export) and `--authkit-*` CSS variables.

## 0.1.2

### Patch Changes

- Updated dependencies [1872a30]
  - @dudousxd/adonis-authkit-core@0.2.0

## 0.1.1

### Patch Changes

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
