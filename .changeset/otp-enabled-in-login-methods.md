---
"@adonis-agora/authkit-server": patch
---

Propaga `otpEnabled` para TODOS os renders do passo login (não só `magicLinkSent`).

O login choose-first (parâmetro `channel`) precisa que a tela do SELETOR — a de
senha renderizada por `show()` depois que o e-mail entrou na sessão, com
`magicLinkSent` ainda falso — saiba se o login por OTP está disponível, para
oferecer a opção "código" ANTES de qualquer envio de magic link. Até agora
`otpEnabled` só era injetado nos renders de `magicLinkRequest` e `otpVerify`,
então o host não conseguia mostrar a opção de código no seletor.

`otpEnabled` (`login.otp.enabled` E o store suporta a capacidade) passa a sair do
helper `#loginMethods` — junto de `authMethods` e `magicLinkAvailable`, por ser
um fato de disponibilidade de método de login. Assim os renders do passo
identifier, do seletor, do `magicLinkSent` e de erro carregam a flag por
construção. As computações inline redundantes em `magicLinkRequest`/`otpVerify`
foram removidas (o valor onde já era usado permanece idêntico); a emissão de
token, o codec `ml2:`, o lockout e qualquer comportamento de segurança ficam
intocados.

Back-compat total: hosts que não leem `otpEnabled` não são afetados; a `login.edge`
default continua mostrando o campo de OTP apenas no estado `magicLinkSent`.
