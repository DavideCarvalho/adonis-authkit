---
"@adonis-agora/authkit-client": minor
---

Adiciona o acessor singleton `@adonis-agora/authkit-client/services/main` (convenção `services/main` do
Adonis, como `db`/`mail`/`drive`). Deixa o app usar
`import authkit from "@adonis-agora/authkit-client/services/main"` e ler `authkit.clientConfig` / chamar
`authkit.getIdToken(ctx)`, `authkit.handleBackchannelLogout(ctx)` etc., em vez de resolver a binding
string-keyed `"authkit.client"` pelo container na mão (`ctx.containerResolver.make("authkit.client")`).
Funciona tanto em controllers-classe quanto em route handlers inline.
