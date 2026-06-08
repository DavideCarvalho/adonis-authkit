---
'@dudousxd/adonis-authkit-server': minor
---

feat: hot-reload das chaves de assinatura JWKS — a chave rotacionada passa a
assinar SEM restart. `OidcService.reloadKeys()` reconstrói e troca a instância do
oidc-provider ao vivo (o estado durável vive no adapter, então nada se perde), e um
poll do `head` do cofre (a cada 60s, só no processo web) propaga rotações feitas por
outro processo/instância — ex.: `authkit:keys:rotate` num worker, ou outra réplica.
