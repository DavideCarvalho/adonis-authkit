# @dudousxd/adonis-authkit-react

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
