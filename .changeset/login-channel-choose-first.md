---
"@adonis-agora/authkit-server": minor
---

Adiciona o parâmetro `channel` ao login passwordless (seletor "choose-first").

O POST `/auth/interaction/:uid/magic` passa a aceitar `channel=code|link` no
body. Quando presente, o e-mail e a tela mostram SÓ aquele método:

- `channel=code` → e-mail com SÓ o código (sem botão/link); a tela mostra apenas
  o campo de código.
- `channel=link` → e-mail com SÓ o link mágico (código suprimido); a tela mostra
  apenas o aviso de "confira sua caixa".
- `channel` ausente/ inválido → ambos, exatamente como hoje (back-compat total).

O `channel` é puramente de SUPERFÍCIE: NÃO condiciona a emissão de token e não
toca no codec `ml2:`, no lockout nem no single-use-conjunto — a lib continua
emitindo link E código co-locados quando `login.otp.enabled`. O que muda é só o
que o e-mail renderiza e qual sub-view a tela exibe.

Threading do canal:

- `mail.onMagicLink` ganha o campo opcional `channel?: 'code' | 'link'` no
  payload (hosts existentes simplesmente ignoram — back-compat).
- O `sendMagicLinkEmail` default renderiza o e-mail conforme o canal (só código,
  só link ou ambos), com degradação limpa (`channel=code` sem código emitido cai
  no e-mail de link).
- O render do estado `magicLinkSent` ganha a prop `magicChannel`
  (`'code' | 'link' | 'both'`) para a tela escolher a sub-view. Ausente = `'both'`.

Sem `channel` no body, tudo é idêntico ao comportamento anterior.
