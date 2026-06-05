---
'@dudousxd/adonis-authkit-testing': minor
'@dudousxd/adonis-authkit-server': minor
'@dudousxd/adonis-authkit-core': minor
---

DX & ops infra:

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
