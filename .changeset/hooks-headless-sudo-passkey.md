---
"@adonis-agora/authkit-react": minor
---

Adiciona hooks e utilitários headless para o "dance" de sudo/passkey por form
clássico, para hosts com telas React próprias.

- `submitClassicForm({ action, fields, method? })`: cria um `<form>` nativo com
  campos hidden e o submete (navegação real) — necessário porque os fluxos de
  sudo/passkey respondem 302, que um `fetch` não segue como navegação. SSR-safe.
- `usePasskeyAssertion({ optionsUrl, actionUrl, csrfToken, returnTo? })` →
  `{ run, running, error }`: pega as options (`x-csrf-token`), roda
  `startAuthentication` e submete o `response` via form clássico (com `_csrf` e
  `return_to` quando fornecidos).
- `usePasskeyRegistration(...)`: idem, com `startRegistration`.

Também exporta as peças de tier mais baixo reusadas por eles (`runPasskeyAssertion`,
`runPasskeyRegistration`, `registerPasskey`, `loadStartRegistration`). O
`submitPasskeyVerification` existente passa a delegar ao `submitClassicForm`,
sem mudança de comportamento.
