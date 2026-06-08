# @dudousxd/adonis-authkit-vault-azure

## 0.2.0

### Minor Changes

- a39352e: feat: packages de cofre do keystore JWKS para AWS Secrets Manager, GCP Secret Manager
  e Azure Key Vault. Cada um exporta `createKeystoreVault(cfg)`; o SDK da cloud é peer
  OPCIONAL (lazy-import). Consumidos pelo authkit-server via o driver `jwks.store`.
