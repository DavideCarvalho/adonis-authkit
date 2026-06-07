---
'@dudousxd/adonis-authkit-client': minor
'@dudousxd/adonis-authkit-react': minor
---

Bring your own IdP — use AuthKit against any OIDC-compliant provider

- **client**: new `discoverEndpoints(issuer)` resolves the IdP's real endpoints from `/.well-known/openid-configuration` (cached per issuer, field-level manual overrides, silent fallback to the oidc-provider conventions when the document is unreachable). All flow helpers (`buildAuthorizeUrl`, `exchangeCode`, `refreshTokens`, `exchangeToken`, `buildEndSessionUrl`) now accept explicit endpoint params — Keycloak, Auth0, Okta, Entra et al. work out of the box.
- **react**: new `idp: 'authkit' | 'external'` config on `AuthkitProvider`. With an external IdP, the components that depend on authkit-server's REST surface (`UserProfile`, `OrganizationSwitcher`, `OrganizationProfile`, `AuthorizedApps`) degrade to `null` instead of calling endpoints that don't exist; sign-in/out, auth state, role gates and the password strength meter keep working.
- New "Bring your own IdP" docs page tying the two together.
