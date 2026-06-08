---
'@dudousxd/adonis-authkit-server': minor
'@dudousxd/adonis-authkit-core': minor
---

feat: cofre do keystore JWKS no HashiCorp Vault (KV v2). Novo driver
`{ driver: 'hashicorp-vault', endpoint, path, token?, mount?, field? }` — usa a API
HTTP do Vault (sem SDK), então mora em core como file/drive/lucid/redis. Encryption
at-rest fica OFF por default (o Vault tem cifra/ACL próprios; ligável p/ envelope).
