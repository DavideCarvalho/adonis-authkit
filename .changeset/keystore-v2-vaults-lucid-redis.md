---
'@dudousxd/adonis-authkit-server': minor
'@dudousxd/adonis-authkit-core': minor
---

feat: cofres do keystore JWKS em Lucid e Redis. Novos drivers `jwks.store`:
`{ driver: 'lucid' }` (tabela dedicada `authkit_keystore`, auto-criada) e
`{ driver: 'redis' }` (uma key). Diferente de `file`, ambos são COMPARTILHADOS entre
instâncias — o melhor default para multi-instância + hot-reload (o poll lê um `head`
barato). Encryption at-rest (APP_KEY) ON por default nos dois. Warning no boot quando
`redis` é usado (exige persistência RDB/AOF). `resolveKeystoreVault` agora recebe um
contexto com acesso ao container (mudança de assinatura interna).
