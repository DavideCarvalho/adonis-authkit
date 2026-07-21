---
'@adonis-agora/authkit-server': minor
---

Montagem por tela do console de conta (`/account/*`) + destino de login configurável.

**1 — `AuthHostOptions.account`.** Nova opção `account?: false | { login?, tokens?,
orgs?, security?, mfa?, apps? }` em `registerAuthHost`, espelhando o padrão
`admin`/`adminApi`: a decisão de MONTAR cada grupo de rotas é tomada em tempo de
registro. Default (opção ausente) = tudo montado — **back-compat total**. `false`
desmonta todas as telas; um objeto desmonta seletivamente (cada flag ausente
default `true`). As rotas de sudo (`/account/confirm`) e a JSON API
(`/account/api/*`) permanecem sempre montadas — são infraestrutura, não telas.

**2 — `AuthHostOptions.accountLoginUrl`.** Destino configurável do redirect de
"não-autenticado → faça login", default `/account/login`. Necessário porque a tela
`account/login` passou a ser desmontável: um host OIDC passwordless aponta para a
própria rota de login (ex.: `/login`). É respeitado por TODOS os pontos de redirect/
link: `accountGuard`, `adminGuard`, `AccountAuthMiddleware`, o helper público
`consoleLoginUrl()`, os fallbacks dos controllers de conta e a view Edge
`otp-unlock` (injetada como prop global `loginUrl` pelo renderer). Novo singleton de
processo `account_login_url.ts` (mesmo padrão de `admin_prefix.ts`).

**3 — `/account/tokens` sem `patStore` → 404 limpo.** As três actions de
`account_tokens_controller` faziam `cfg.patStore!` sobre config opcional →
`Cannot read properties of undefined` (500). Agora degradam para 404, como orgs
sem tabelas. Mesma classe de bug corrigida em `pat_introspection_controller`
(`/authkit/pat/introspect`, sempre montada): sem `patStore`, devolve `{ active: false }`
em vez de 500 — resposta negativa do protocolo (RFC 7662), não um 404 HTTP, já
que o endpoint é M2M JSON e sempre existe independente do store.

**4 — Contrato de props documentado.** Adicionadas as tabelas de props de
`account/security`, `account/mfa`, `account/confirm` e `account/email-confirmed`
ao docblock de `inertiaRenderer` (extraídas dos controllers reais), completando o
que já existia para `account/login`.

**5 — `verifyCredentials` com hash null/vazio.** Coberto por teste que
`lucidAccountStore.verifyCredentials` devolve `null` sem lançar quando a coluna
`password` é null ou vazia (contas passwordless) — pré-requisito para o app tornar
a coluna nullable. Nenhuma correção foi necessária: o `try/catch` de
`PasswordManager.verify` já engolia o throw do scrypt em hash malformado; o teste
pina o contrato.
