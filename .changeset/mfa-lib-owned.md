---
"@dudousxd/adonis-authkit-server": minor
---

MFA agora é totalmente lib-owned: o estado de TOTP/recovery/anti-replay (`totp_secret`, `mfa_enabled_at`, `recovery_codes`, `last_totp_step`) migra das colunas na tabela `users` do host para uma tabela própria auto-gerida `auth_mfa` (schema das tabelas da lib). Apps NÃO precisam mais de migration para MFA — o `withMfa()` continua sendo composto no model mas não declara mais colunas. Sem migração de dado para quem ainda não tem MFA enrolado; quem já tem precisa copiar as colunas para `auth_mfa`.
