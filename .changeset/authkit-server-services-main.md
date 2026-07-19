---
"@adonis-agora/authkit-server": minor
---

Adiciona o acessor singleton `@adonis-agora/authkit-server/services/main` (convenção `services/main` do
Adonis, como `@adonisjs/lucid/services/db`, `@adonisjs/drive/services/main` e `@adonisjs/lock/services/main`).
Deixa o app usar `import authkit from "@adonis-agora/authkit-server/services/main"` e ler `authkit.config` /
acessar `authkit.provider` etc., em vez de resolver a binding string-keyed `"authkit.server"` pelo container
na mão (`ctx.containerResolver.make("authkit.server")`). Funciona tanto em controllers-classe quanto em
route handlers inline.

Espelha o que o `authkit-client` já expõe. A binding `"authkit.server"` continua registrada e é a forma
suportada de resolver o serviço DENTRO da lib — que é o idioma das libs first-party do Adonis (ver
`@adonisjs/auth`, que resolve `ctx.containerResolver.make("auth.manager")` no próprio middleware).
