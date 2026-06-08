---
'@dudousxd/adonis-authkit-server': minor
---

feat: drivers de cofre cloud do keystore JWKS via packages externos. O driver
`{ driver: 'aws-secrets-manager' | 'gcp-secret-manager' | 'azure-key-vault' }` agora
resolve para um `LazyExternalVault` que carrega o package dedicado no primeiro I/O
(erro claro pedindo pra instalar se ausente). HashiCorp já está em core.
