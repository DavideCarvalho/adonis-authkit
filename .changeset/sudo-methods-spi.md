---
'@adonis-agora/authkit-server': minor
---

SPI de métodos de sudo (`SudoMethod`), com `completeSudo` como ponto único de
concessão de privilégio.

**Por quê:** hosts passwordless ficavam permanentemente presos fora de toda
operação sensível da área de conta — exportar/excluir dados (LGPD), MFA, PATs,
troca de e-mail. Sudo exigia senha ou passkey; o host não tem senha; e cadastrar
passkey também exige sudo. Deadlock fechado, e era o comportamento DEFAULT:
`requireSudo` cai em `SUDO_MODE_DEFAULTS.enabled = true` quando o host não tem
`SettingsCapability`.

**Novos métodos:** `sudoMethods.oidcStepUp({ url })` (sempre disponível — é o que
quebra o deadlock, via `prompt=login`) e `sudoMethods.magicLink()` (token de
escopo próprio, nunca o de login: `randomBytes(32)`, hash na sessão, single-use,
5 min, vinculado à conta emissora). `password` e `passkey` foram migrados para o
SPI mantendo suas URLs históricas (`POST /account/confirm`,
`POST /account/confirm/passkey[/options]`).

**Como configurar.** A lista vai em DOIS lugares e eles precisam casar:

```ts
// config/authkit.ts — o que a TELA oferece e o que os handlers ACEITAM
defineConfig({ sudo: { methods: [sudoMethods.oidcStepUp({ url: '/auth/step-up' }), sudoMethods.password()] } })

// start/routes.ts — o que tem ROTA montada
registerAuthHost(router, { mountPath: '/oidc', sudoMethods: [sudoMethods.password()] })
```

São dois porque a montagem de rotas acontece em tempo de registro, antes de o
config (lazy) resolver — mesma razão de `social`/`admin`/`rateLimit`. Sem
`AuthHostOptions.sudoMethods`, um método fora dos built-in apareceria na tela
com endpoint 404 — e `magicLink()` não seria alcançável em runtime de jeito
nenhum. Divergiram, a tela loga um aviso de flag-drift.

`config.sudo.methods` desabilita o endpoint DE FATO, não só a opção da tela: o
runtime embrulha os handlers no ponto de registro, então a barreira vale
inclusive para um método customizado que nunca a tenha consultado.

---

### Novos exports

`sudoMethods`, `completeSudo`, `sudoContextFrom`, `failSudo`,
`LAST_METHOD_SESSION_KEY` e os tipos `SudoMethod`, `SudoContext`,
`SudoMethodDescriptor`, `SudoRouteHelpers`.

`completeSudo` é público porque o host PRECISA chamá-lo: `oidcStepUp` não
registra rotas — quem valida o grant é o callback do host. `markSudo` continua
exportada mas está `@deprecated`: ela grava a marca e nada mais (sem audit
`sudo.confirmed`, sem preferência de método, sem redirect para o `return_to`).

---

### BREAKING — telas custom da view `account/confirm`

As props mudaram de `{ passwordless, passkeyAvailable }` para
`{ methods, preferredId, notice }`:

- `methods`: `Array<{ id, labelKey, kind: 'form' | 'action' | 'redirect', endpoint, fields? }>`;
- `preferredId`: id do último método usado com sucesso, para destaque;
- `notice`: aviso já traduzido (ex.: "link enviado"), irmão de `error`.

Hosts que usam o template Edge embutido não precisam fazer nada.

### BREAKING NO DEPLOY — sessões e challenges vivos perdem a confirmação

A vinculação à conta virou ESTRITA (fail-closed) em dois pontos: o challenge de
passkey do confirm e a marca de sudo (`authkit_sudo_account`). Marca ou
challenge sem vinculação é recusado — e é exatamente essa a forma que as
sessões anteriores ao deploy têm. Consequência prática: quem estava com sudo
ativo, ou com um challenge de passkey pendente, no momento do deploy precisa
reconfirmar UMA vez. Não há migração possível: o dado que faltava (de quem era a
marca) não existe retroativamente.

---

### Comportamentos deliberados, para não parecerem bug

**O login primário concede sudo à revelia de `config.sudo.methods`.** É correto
e intencional: autenticação primária recente É confirmação de identidade — o
modelo do GitHub. `sudo.methods` governa a TELA DE RE-CONFIRMAÇÃO (o que
oferecer a quem já está logado há um tempo), não o login. Um host que remova
`password` de `sudo.methods` continua vendo sudo concedido logo após um login
por senha, e isso não é a config sendo ignorada.

**O método `passkey` via template Edge está degradado nesta versão.** O JS do
WebAuthn saiu da view e nada o substituiu: o botão de passkey do template
embutido SEMPRE falha. O misrender silencioso foi corrigido (a opção não
aparece mais quebrada), mas seja inequívoco sobre o alcance disso — uma conta
passkey-only só tem caminho utilizável em host com renderer próprio
(React/Inertia), onde a página implementa `navigator.credentials.get` e posta a
assertion em `POST /account/confirm/passkey`. Em host Edge, configure ao menos
um outro método (`oidcStepUp`, `magicLink` ou `password`).

---

### Correções

- **Escalação via impersonação (segurança).** A marca de sudo não era vinculada
  à conta, e a impersonação troca a conta da sessão sem invalidá-la: dentro da
  graça de 15 min, o sudo do admin valia sobre a conta impersonada — e o do
  impersonado, de volta sobre o admin. A marca agora carrega o `accountId`
  e `isSudoActive` recusa quando não bate.
- **`accountHome` nunca era propagado ao config resolvido**, então o redirect
  pós-confirmação sempre caía no default `/account/security`, ignorando o valor
  do host.
- **`isPasswordless`** foi removido; o docblock descrevia uma heurística com
  passkeys que o código não implementava.

---

### Limitação conhecida

O POST que emite o magic link de sudo NÃO tem rate limit, e não tem como ter:
`SudoRouteHelpers` não expõe throttle, então nenhum método do SPI consegue
pedir um. O impacto é contido — a rota fica atrás do `accountGuard` (exige
sessão de conta viva) e cada emissão sobrescreve o pendente anterior na própria
sessão, de modo que não há amplificação por sessão —, mas uma sessão autenticada
consegue disparar e-mails em loop. Host que se importe põe throttle na rota pelo
lado dele. Fechar isso direito exige acrescentar throttle ao contrato de
`SudoRouteHelpers`, mudança de forma do SPI que não cabia nesta entrega.
