---
'@dudousxd/adonis-authkit-server': patch
---

Expõe `clientId` no `brand` das telas de auth

O `brandFor()` agora inclui o `clientId` (OIDC) no objeto `brand` passado a cada tela renderizada. Hosts com IdP único e múltiplos produtos podem escolher tema/shell por client de forma robusta (`REGISTRY[brand.clientId]`) em vez de casar por `appName`. Ver recipe "Per-client auth UI".
