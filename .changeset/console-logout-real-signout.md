---
'@dudousxd/adonis-authkit-server': patch
---

fix(console): "Sign out" do console admin agora desloga de verdade

O botão de logout do console (`Sidebar`) era um `<a href="/account/login">` — não
encerrava a sessão. Como a sessão seguia ativa, o `/account/login` redirecionava
pro `accountHome` (default `/account/security`), então o usuário "deslogava" mas
continuava logado, caindo numa tela de conta. Agora é um `<form method="POST"
action="/account/logout">` com CSRF, que faz `session.forget` e redireciona pro
`/account/login` de verdade.
