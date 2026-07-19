---
"@adonis-agora/authkit-server": minor
---

Permite configurar o remetente (`from`) dos e-mails internos da lib (alertas de novo acesso/dispositivo, reset de senha, verificação, magic link default, avisos de segurança) via `defineConfig({ mail: { from } })`. Tem prioridade sobre o `from` global do `config/mail.ts` do host — assim o auth pode usar um remetente próprio (ex.: `Segurança <no-reply-auth@dominio>`) sem trocar o remetente dos e-mails gerais do app. Sem `from` em lugar nenhum, o envelope MAIL FROM ficava vazio e provedores como o Resend rejeitavam com `550 Invalid from`; agora o `defaultFrom` resolve authkit → host → default do @adonisjs/mail.
