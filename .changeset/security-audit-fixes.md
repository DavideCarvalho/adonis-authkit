---
"@dudousxd/adonis-authkit-server": minor
---

Correções de segurança (auditoria 2026-06-08):
- Token-exchange travado: subject_token deve ser do client autenticado, scope reduzido à interseção com o client, audience/resource não suportado rejeitado.
- Allowlist de grant_types nos clients (bloqueia `implicit`); redirect/post-logout URIs validados como URI http/https absoluta.
- Proteção de "último admin" + bloqueio de auto-rebaixamento; REST API valida globalRoles contra o catálogo; throttle por IP no grupo admin-api; auditoria REST registra o id (hash) da admin key em vez de null.
- IDOR cross-org corrigido: revogação de convite escopada por organização; role de membro/convite validada contra o catálogo (sem promoção a `owner` por admin não-owner).
- Login resistente a enumeration por timing (dummy-hash); settings de lockout passam a valer em runtime; reset/troca de senha revoga sessões/grants OIDC; `/account/login` com throttle por IP + email normalizado.
- Sessão regenerada no login (anti-fixation) e destruída no logout; TOTP com proteção de replay (coluna `last_totp_step`); encrypter de conta fail-closed (decrypt falho → nega, não devolve ciphertext); single-session propaga revogação cookie-based; `return_to` rejeita backslash (open redirect).
