---
'@dudousxd/adonis-authkit-server': minor
'@dudousxd/adonis-authkit-sdk': minor
---

feat: rotação automática de chaves JWKS (age-based) + política + endpoints + SDK.

Nova setting `key_rotation` (`{enabled,maxAgeDays,keep}`, default OFF). Um scheduler
de housekeeping (web-only, fail-safe) rotaciona a chave quando ela passa de
`maxAgeDays` e aplica AO VIVO (sem restart, via `reloadKeys` da Fatia C), com
single-flight via `@adonisjs/lock` (peer opcional; sem ele assume single-instance).
`OidcService` ganha `rotateKeys()`/`keystoreAgeDays()` (rotate+reload serializados).

Dois tiers de endpoint admin para status + "rotacionar agora":
- **REST API** `GET/POST /api/authkit/v1/keys` (Bearer key) — para backend/automação;
- **Console API** `GET/POST {adminPrefix}/api/keys` (sessão + role admin) — para o browser.

`@dudousxd/adonis-authkit-sdk` expõe `authkit.keys.status()` / `authkit.keys.rotate()`
(drivers remote + embedded). `@adonisjs/lock` é peer OPCIONAL.

Default OFF: nada rotaciona automaticamente até um admin habilitar `key_rotation`.
