---
'@dudousxd/adonis-authkit-server': minor
'@dudousxd/adonis-authkit-core': minor
---

feat: keystore JWKS managed com cofre pluggável + encryption at-rest (Fatia A+B)

O keystore managed deixa de ser fs-síncrono-num-path e passa por uma abstração de
cofre (`KeystoreVault`): `file` (default) e `drive` (`@adonisjs/drive`, bucket), com
contrato para cofres custom. O keystore PRIVADO agora é encriptado em repouso por
default (APP_KEY) para file/drive via um envelope versionado; decrypt falho lança
(nunca regenera em silêncio). O boot e o comando `authkit:keys:rotate` usam o mesmo
stack (defaults de encryption idênticos). Novidades: aviso no boot quando
`jwks: 'auto'` cai no fallback de disco, e idade da chave de assinatura no
`authkit:doctor`. Config: `jwks.store` aceita `{ driver: 'file' | 'drive' | ... }`
além de string, e novo `jwks.encrypt`.

Nota (0.x): sem migração de keystore legado — um `tmp/authkit_jwks.json` plaintext
pré-existente deve ser apagado uma vez (regenera encriptado).
