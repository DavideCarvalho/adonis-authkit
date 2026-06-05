---
'@dudousxd/adonis-authkit-sdk': minor
---

Primeiro release do SDK backend (@dudousxd/adonis-authkit-sdk): uma interface tipada com dois drivers — `remote` (HTTP contra a Admin REST API `/api/authkit/v1` com Bearer API key) e `embedded` (in-process, quando o IdP roda no mesmo app AdonisJS). Cobre users, sessions, clients, audit e tokens.verify, com erros mapeados para `AuthkitApiError`.
