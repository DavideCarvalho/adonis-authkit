---
'@dudousxd/adonis-authkit-server': patch
---

Logout deixa de mostrar a tela default do oidc-provider ("Do you want to sign-out from…?")

O RP-initiated logout (end_session) usava o `logoutSource`/`postLogoutSuccessSource` default do oidc-provider — HTML sem estilo, em inglês, pedindo confirmação. Agora um splash de marca ("Saindo…", i18n en/pt-BR) auto-confirma o logout (injeta `logout=yes` e submete via JS, com `<noscript>` acessível), e a tela de sucesso (quando não há `post_logout_redirect_uri`) também é tematizada.
