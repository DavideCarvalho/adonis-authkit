---
"@adonis-agora/authkit-server": minor
---

Recuperação graciosa da sessão de interaction OIDC perdida (`SessionNotFound`)

Quando a sessão de interaction do `oidc-provider` está expirada ou perdida
(cookie velho, F5 tardio depois do TTL, restart do servidor que limpou o store
efêmero), `provider.interactionDetails()` lançava `SessionNotFound` e o erro
vazava cru para o usuário no meio do login. Perder essa sessão é um caso NORMAL,
então o authkit agora RECUPERA por padrão.

- **Comportamento padrão (zero config): tela themeável `session-expired`.** Nova
  view Edge built-in (pt-BR + en) com mensagem amigável e link "voltar ao login".
  O host pode substituí-la por uma página React adicionando `'session-expired'`
  ao allowlist `views` do `inertiaRenderer` (props: `{ loginUrl, brand }`).
- **Opção de redirect.** `interactionRecovery: { mode: 'redirect', redirectTo }`
  responde 302 para o login em vez de renderizar a tela. Default:
  `{ mode: 'screen' }`. O `redirectTo` cai em `accountLoginUrl` quando omitido.
- **Centralizado.** O `SessionNotFound` é detectado num único choke point
  (`createInteractionActions().details`/`consent`) pelo nome da classe do erro
  (não por match de mensagem) e convertido na exceção self-handling
  `InteractionSessionLostException` — nenhum handler de interaction precisou de
  try/catch próprio. Fluxo normal (sessão válida) inalterado.
