---
'@dudousxd/adonis-authkit-server': patch
---

fix: admin client update (PATCH) agora MESCLA em vez de resetar campos não-enviados

O update de client da Admin API/console fazia full-replace: campos ausentes no
body caíam no default — não mandar `tokenEndpointAuthMethod` virava o client
`confidential` (client_secret_basic), e não mandar grants derrubava grants como
`token-exchange`. Agora o `update` preserva os valores atuais para qualquer campo
não enviado (PATCH de verdade). Além disso, os controllers passam a aceitar `grants`
(o mesmo nome do dto de saída) como alias de `grantTypes` na entrada.
