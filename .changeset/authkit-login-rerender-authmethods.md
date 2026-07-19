---
"@adonis-agora/authkit-server": patch
---

Corrige: os re-renders do passo de login (erro de senha, lockout, magic link enviado, e-mail não
verificado) mandavam `authMethods` undefined pra view — só o GET `show()` passava. Com `authMethods`
ausente, a tela voltava ao default (senha ligada), **ignorando `cfg.authMethods` / o setting de runtime**:
o input de senha aparecia mesmo com `authMethods: { password: false }`.

Agora um helper `#loginMethods(ctx, cfg)` resolve os métodos efetivos (com os pins do config) e todos os
renders do passo login passam `authMethods` + `magicLinkAvailable`. O input de senha respeita a config em
qualquer caminho de render.
