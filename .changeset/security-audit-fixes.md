---
"@dudousxd/adonis-authkit-server": minor
---

Correções de segurança (auditoria 2026-06-08):
- Token-exchange travado: subject_token deve ser do client autenticado, scope reduzido à interseção com o client (scope inválido → `invalid_scope`), audience/resource não suportado rejeitado.
- Allowlist de grant_types nos clients (bloqueia `implicit`); redirect/post-logout URIs validados como URI http/https absoluta.
- Proteção de "último admin" + bloqueio de auto-rebaixamento; REST API valida globalRoles contra o catálogo; throttle por IP no grupo admin-api; auditoria REST registra o id (hash) da admin key em vez de null.
- IDOR cross-org corrigido: revogação de convite escopada por organização; role de membro/convite validada contra o catálogo (sem promoção a `owner` por admin não-owner).
- Login resistente a enumeration por timing (dummy-hash); settings de lockout/verified-email/expiração passam a valer em runtime no fluxo OIDC E no login de sessão do console; reset/troca de senha revoga sessões/grants OIDC; `/account/login` com throttle por IP + email normalizado.
- Sessão regenerada no login (anti-fixation) e destruída no logout; TOTP com proteção de replay; encrypter de conta fail-closed (decrypt falho → nega, não devolve ciphertext); single-session propaga revogação cookie-based; `return_to` rejeita backslash (open redirect).

**MIGRAÇÃO NECESSÁRIA (anti-replay TOTP):** o mixin de MFA agora declara a coluna `last_totp_step` (bigint, nullable) na tabela de contas do host. Hosts que usam TOTP DEVEM adicionar a coluna numa migração antes de subir esta versão, senão o primeiro login TOTP pós-upgrade falha ao persistir o step. Ex.: `table.bigInteger('last_totp_step').nullable()`.
