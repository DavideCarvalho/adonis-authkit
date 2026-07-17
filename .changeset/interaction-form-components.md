---
"@adonis-agora/authkit-react": minor
---

Login por senha/magic link/OAuth também nas camadas do ecossistema — some a concatenação de URL à mão e o `_csrf` repetido em cada form:

- **Funções (`interactionUrls`, `oauthRedirectUrl`)** — builders tipados das URLs de interaction (identifier, login, magic, signup, switch, passkey/options, passkey/verify) e do redirect OAuth. Fonte única: se o prefixo de rota do authkit-server mudar, não quebra silenciosamente em string mágica espalhada.
- **Primitivo (`InteractionForm`)** — `<form method="POST">` no endpoint certo + o campo escondido `_csrf`, deixando os campos e o estilo pro app. Encapsula o boilerplate que se repetia em identifier/login/magic.
- **Componentes prontos (`MagicLinkButton`, `OAuthButton`)** — o "faz tudo", construídos sobre o primitivo/as funções, temáveis via `className`/`children`.
- **Helper `buttonClass(variant, extra)`** — centraliza a mescla de className dos botões do authkit (base + variante + extra do host), que os componentes repetiam.
