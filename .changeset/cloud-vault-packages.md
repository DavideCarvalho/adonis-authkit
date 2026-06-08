---
'@dudousxd/adonis-authkit-vault-aws': minor
'@dudousxd/adonis-authkit-vault-gcp': minor
'@dudousxd/adonis-authkit-vault-azure': minor
---

feat: packages de cofre do keystore JWKS para AWS Secrets Manager, GCP Secret Manager
e Azure Key Vault. Cada um exporta `createKeystoreVault(cfg)`; o SDK da cloud é peer
OPCIONAL (lazy-import). Consumidos pelo authkit-server via o driver `jwks.store`.
