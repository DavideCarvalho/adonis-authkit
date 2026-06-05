# @dudousxd/adonis-authkit-client

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
