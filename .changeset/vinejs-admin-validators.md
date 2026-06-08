---
'@dudousxd/adonis-authkit-server': minor
---

refactor: controllers do admin (Admin REST API + console) validam input com VineJS

Os controllers administrativos liam o body na mão via `ctx.request.input(...)`
com coerção ad-hoc (`asArray`, checagens de presença) e devolviam `400`
`invalid_request` quando faltava campo — sem schema, o que originou o bug do
`grantTypes` vs `grants`. Agora cada recurso tem um validator VineJS em
`host/admin_validators.ts` (compartilhado entre a Admin REST API e o console, que
têm as mesmas formas de input) chamado via `request.validateUsing(...)`.

Migrados: **clients** (create/update), **users** (create/update/roles),
**organizations** (create/update/membros/convites), **catálogo de roles**
(create/update), **sessions** (`revoke-all` — accountId por query/param validado
direto com `validator.validate(...)`) e **tokens/verify**.

**BREAKING (admin API):** input inválido agora responde `422` com o envelope de
erro do VineJS (`{ errors: [...] }`) em vez de `400` `{ error: { code:
'invalid_request' } }`. A política de senha continua no `AdminUsersService`
(o validator de criação de usuário NÃO fixa `minLength` — não duplica a policy
configurável do projeto). O merge do PATCH de client (campos ausentes preservados)
e o alias `grants`↔`grantTypes` seguem funcionando.

Forms Edge (account/orgs, confirm, session), blobs WebAuthn, flags de checkbox,
o endpoint RFC 7662 de introspecção e inputs opcionais-com-default ficam de fora
de propósito (ver o doc no topo de `admin_validators.ts`).
