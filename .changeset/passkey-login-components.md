---
"@adonis-agora/authkit-react": minor
---

Login por passkey disparado por clique, nas três camadas do ecossistema — o app deixa de reescrever a cerimônia à mão:

- **Função (`authenticatePasskey`, `submitPasskeyVerification`, `loadStartAuthentication`)** — a cerimônia pura (POST das options → `startAuthentication` → serializa a assertion) e o submit de página inteira no `verify`. Totalmente customizável: use só a peça que precisar.
- **Hook headless (`usePasskeyLogin`)** — `{ authenticate, busy, failed }`. Roda a cerimônia e faz o submit; passe `onSuccess` pra controlar a verificação você mesmo (meio-do-caminho). O app é dono do visual do botão.
- **Componente pronto (`PasskeyButton`)** — o "faz tudo": botão + estado + erro, temável via `className`/`children`. Construído sobre o hook.

`@simplewebauthn/browser` continua sendo import lazy (pacote local → CDN), sem virar dependência. O `usePasskeyAutofill` passa a reusar o mesmo `loadStartAuthentication` (some a duplicação do carregamento da lib).
