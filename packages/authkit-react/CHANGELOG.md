# @dudousxd/adonis-authkit-react

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
