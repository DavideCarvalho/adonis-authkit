# @adonis-agora/authkit-server

## 0.52.1

### Patch Changes

- c4f6d4a: Corrige a tela `session-expired` respondendo 400 com corpo vazio (recuperação de interaction perdida no modo `screen`)

  A recuperação graciosa da sessão de interaction perdida introduzida na 0.52.0
  estava QUEBRADA out-of-the-box no modo `screen` (default): renderizava um 400
  com **corpo vazio** em qualquer host, sem uma ponte manual no
  `app/exceptions/handler.ts`.

  Causa: no modo `screen`, `recoverLostInteraction` fazia `return render(...)`, e
  tanto o renderer Edge (`view.render`) quanto o Inertia (`inertia.render`)
  RETORNAM o HTML/payload em vez de escrever no response. No caminho de exception
  handler do AdonisJS, o valor retornado do `handle()` da exceção é DESCARTADO
  (apenas o dispatch normal de rota escreve o retorno via `useReturnValue`/
  `canWriteResponseBody`), então o corpo nunca era enviado — contradizendo o
  próprio contrato da feature ("roda de forma centralizada, sem depender de o host
  customizar o `app/exceptions/handler.ts`").

  Correção: no modo `screen`, a lib agora ESCREVE o body ela mesma, replicando
  fielmente o contrato `canWriteResponseBody` do http-server — após
  `ctx.response.status(400)`, `const body = await render(...)` e, se
  `body !== undefined && !ctx.response.hasLazyBody && body !== ctx.response`,
  `ctx.response.send(body)`. O guard `hasLazyBody` evita double-write e cobre os
  DOIS renderers built-in (Edge e Inertia). O modo `redirect` e o fluxo normal
  (sessão válida) permanecem inalterados.

## 0.52.0

### Minor Changes

- b895a11: Recuperação graciosa da sessão de interaction OIDC perdida (`SessionNotFound`)

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

## 0.51.1

### Patch Changes

- 07f4191: Propaga `otpEnabled` para TODOS os renders do passo login (não só `magicLinkSent`).

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

## 0.51.0

### Minor Changes

- 500a5ee: Adiciona o parâmetro `channel` ao login passwordless (seletor "choose-first").

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

## 0.50.0

### Minor Changes

- 28013ed: Adiciona login por OTP (código digitável) como extensão opt-in do magic link.

  Hosts passwordless agora podem oferecer, ALÉM do magic link, um código numérico
  digitável — para quem lê o e-mail no celular e usa o app no desktop. O MESMO
  e-mail passa a carregar link E código, e os dois completam a MESMA interaction
  OIDC (amr `['email']`, resultado idêntico ao do link).

  Ligue com `login.otp` no `config/authkit.ts` (default **desligado**, back-compat
  total — sem a config o comportamento e o e-mail são idênticos aos de antes):

  ```ts
  login: {
    otp: { enabled: true, digits: 6, ttlMinutes: 10, maxAttempts: 5 },
  }
  ```

  Segurança (código de 6 dígitos é adivinhável, ≠ magic link de 256 bits):

  - **Lockout por interaction fail-CLOSED**: o contador de tentativas fica
    PERSISTIDO junto do código (no mesmo slot do magic link), então a proteção
    anti-brute-force funciona MESMO sem `@adonisjs/limiter` — diferente do
    `otp_lockout` do fator TOTP, que vira no-op sem limiter. Na 5ª falha o código é
    invalidado (o link continua válido). A verificação faz o read-modify-write do
    contador dentro de uma transação com row-lock (`forUpdate`), serializando as
    tentativas: N verificações concorrentes não conseguem burlar o lockout
    (o total de comparações contra um mesmo código fica limitado a `maxAttempts`).
  - **Throttle de rota dedicado** `authkit_otp_login` por IP, mais apertado que o
    login (5/min), como camada extra.
  - Geração cripto sem viés de módulo (`randomInt`, zero-padded), comparação de
    hash constant-time (`timingSafeEqual`), hash atrelado ao `uid` da interaction.
  - **Single-use conjunto**: consumir o código mata o link e vice-versa.

  Novidades de API: `login.otp` na config; `OtpLoginCapability` +
  `supportsOtpLogin` no account store (o store Lucid default já implementa, sem
  migração — co-localiza o código no slot `passwordResetToken`); slot `code` no
  template de e-mail e no payload do hook `onMagicLink`; eventos de auditoria
  `login.otp_sent` / `login.otp_verified` / `login.otp_failed` /
  `login.otp_invalidated`; rota `POST /auth/interaction/:uid/otp-verify`; strings
  i18n pt-BR + en. A view Edge default ganha o campo de código no bloco
  "link enviado".

## 0.49.0

### Minor Changes

- efd30df: Exporta os tipos de props das telas de conta e os helpers de path do console.

  Hosts que criam as telas do console (`/account/*`) em React próprio (via
  `inertiaRenderer`) agora tipam cada página com os tipos exportados
  `AccountLoginProps`, `AccountSecurityProps`, `AccountMfaProps`,
  `AccountConfirmProps` e `AccountEmailConfirmedProps` (mais `AccountConfirmMethod`),
  em vez de copiar o shape do docblock à mão. Esses tipos são a fonte única da
  verdade: os próprios controllers os satisfazem (`satisfies Omit<…, 'messages'>`)
  ao renderizar, então qualquer divergência quebra o build da lib. O docblock do
  `inertiaRenderer` passa a referenciar os tipos.

  Também passam a ser exportados os helpers de path do console —
  `accountPath`, `joinAccountPath`, `accountPrefix` e o tipo `AccountPathsOptions`
  (e `AccountPathKey`) — para que um host derive rotas do console (ex.:
  `GET ${accountPath('security')}/export`) respeitando os overrides de
  `accountRoutes`, em vez de hardcodar. Eles refletem os overrides após
  `registerAuthHost` rodar.

## 0.48.0

### Minor Changes

- bb257c0: Rotas do console de conta configuráveis/localizáveis + 2 fixes de MFA

  **Feature: `accountRoutes`.** Novo módulo `account_paths.ts` (singleton de processo, no mesmo padrão de `admin_prefix`/`account_login_url`) que torna o prefixo do console de conta (`/account` → `/conta`) e o segmento de cada tela navegável (`security` → `seguranca`, `confirm` → `confirmar`, ...) configuráveis via a opção top-level `accountRoutes: { prefix?, paths? }` no `registerAuthHost`. O prefixo/segmentos se propagam por todas as camadas: registro de rotas, redirects dos controllers, redirect de sudo, fluxo magic-link, URLs dos e-mails transacionais e as views Edge (incl. os `fetch()` do `mfa.edge`, via a prop global `accountPaths`). `getAccountLoginUrl` e `accountHome` passam a derivar dos overrides.

  Os action-subpaths dos POSTs internos (`/password`, `/enroll`, `/passkeys/verify`, ...) e o segmento `api` da JSON API (`{prefix}/api/*`) permanecem FIXOS — são endpoints de máquina, invisíveis ao usuário. A opção é top-level de propósito: mesmo com `account: false`, as rotas de sudo e a JSON API continuam montadas e respeitam o prefixo.

  Back-compat total: sem `accountRoutes`, tudo permanece em `/account/*`.

  **Fix (`inertiaRenderer`):** o docblock de contrato de props da tela `account/mfa` documentava só o shape do `index`; agora inclui `enrolling`, `secret`, `qrDataUrl` e `error`, que o controller injeta nos passos de `enroll`/`confirm`.

  **Fix (`passkeyRegisterVerify`):** no sucesso com sudo já ativo o endpoint respondia sempre `{ ok: true }` JSON — um `<form>` HTML clássico ficava encarando JSON cru. Agora detecta navegação (aceita `text/html` e não pede `application/json`) e responde redirect para a tela de MFA, mantendo o JSON para XHR/fetch.

## 0.47.0

### Minor Changes

- b1ba275: Montagem por tela do console de conta (`/account/*`) + destino de login configurável.

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

### Patch Changes

- 481ae7a: Corrige dois resíduos do dual-package hazard e endurece a visibilidade de falha.

  **1 — `recordSubRevocation` resolvia o Lucid pela classe `Database`.**
  `AdminSessionsService.recordSubRevocation` ainda fazia `import('@adonisjs/lucid/services/db')`,
  que resolve a CLASSE `Database` e a usa como TOKEN do container. Com duas cópias físicas do
  lucid na árvore do host (pins distintos, ou o mesmo pin sob peer sets distintos que o pnpm
  materializa em diretórios separados), os tokens-classe diferem, o `make()` falha e — pior — a
  gravação da revogação por `sub` (`auth_session_revocations`) era engolida EM SILÊNCIO pelo catch
  best-effort: nem crash, nem log. Agora resolve pelo alias string `'lucid.db'` (o mesmo idioma de
  `runtime_settings.ts` e do provider), imune à deduplicação do host. A falha continua sem
  propagar (a invalidação server-side já é a fonte da verdade), mas nunca mais é silenciosa: é
  logada em `error`.

  **2 — `services/main` capturava o `app` do core por import eager.**
  `services/main.ts` importava `app` de `@adonisjs/core/services/app` (eager) + `await app.booted()`
  no top-level — o mesmo hazard, agora para o singleton do core: sob pnpm este pacote pode resolver
  uma cópia física de `@adonisjs/core` diferente da que o `bin/server` bootou, cujo binding de
  `services/app` fica `undefined`. O `app` passa a vir de `services/booted_app.ts`, capturado pelo
  provider no `register()` via `setBootedApp(this.app)`. Back-compat total: o `default` continua
  sendo o `OidcService` resolvido.

  Também: adicionado `prepack` (espelha o `build` composto — css + webauthn + ui + tsc + cópias)
  para que o pacote seja sempre construído antes de publicar.

  **Nota de transparência:** a escrita best-effort da revogação de sessão e o
  `services/main` agora exigem o `AuthkitServerProvider` registrado; sem ele,
  lançam/logam erro explícito em vez de silenciar ou pendurar. Nenhum host real
  perde comportamento (o provider é sempre registrado), mas suítes downstream que
  exercitem deleção/revogação sem o provider verão o erro no stderr.

## 0.46.0

### Minor Changes

- 4b17ac4: SPI de métodos de sudo (`SudoMethod`), com `completeSudo` como ponto único de
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
  defineConfig({
    sudo: {
      methods: [
        sudoMethods.oidcStepUp({ url: "/auth/step-up" }),
        sudoMethods.password(),
      ],
    },
  });

  // start/routes.ts — o que tem ROTA montada
  registerAuthHost(router, {
    mountPath: "/oidc",
    sudoMethods: [sudoMethods.password()],
  });
  ```

  **`sudoMethods` SUBSTITUI os defaults, não acrescenta a eles.** O exemplo acima
  monta SÓ `password`: `passkey`, que vinha por default, some sem aviso nenhum.
  Passar a opção é declarar a lista COMPLETA do host — quem quiser os built-in
  junto do seu método precisa repeti-los (`[sudoMethods.password(),
sudoMethods.passkey(), meuMetodo()]`). Vale igual para `config.sudo.methods`.

  São dois porque a montagem de rotas acontece em tempo de registro, antes de o
  config (lazy) resolver — mesma razão de `social`/`admin`/`rateLimit`. Sem
  `AuthHostOptions.sudoMethods`, um método fora dos built-in apareceria na tela
  com endpoint 404 — e `magicLink()` não seria alcançável em runtime de jeito
  nenhum. Divergiram, a tela loga um aviso de flag-drift.

  **Sem `config.sudo.methods`, os dois lados não têm como divergir:** a tela
  oferece a lista que `registerAuthHost` MONTOU, que é exatamente a que os
  handlers aceitam. Um host que passe só

  ```ts
  registerAuthHost(router, { sudoMethods: [sudoMethods.magicLink()] });
  ```

  vê a tela oferecer magic-link, e só. (Antes ela caía numa lista de defaults
  própria e oferecia password + passkey, ambos 404, escondendo o único método
  que de fato funcionava.)

  `config.sudo.methods` desabilita o endpoint DE FATO, não só a opção da tela: o
  runtime embrulha os handlers no ponto de registro, então a barreira vale
  inclusive para um método customizado que nunca a tenha consultado.

  O escopo exato: a rota tem de ter sido montada por `SudoMethod.register()` **e**
  com handler-FUNÇÃO — é a única forma que o wrapper sabe embrulhar. Registrar por
  tupla (`[Controller, 'metodo']`) ou por `resource()`/`shallowResource()` agora
  **lança no boot**, com a mensagem explicando a saída
  (`(ctx) => new Controller().metodo(ctx)`). Antes passava direto e produzia uma
  rota de sudo desguardada, em silêncio.

  Fora disso o escopo acaba: com `completeSudo` público, qualquer rota que o host
  escreva à mão em `start/routes.ts` concede sudo sem passar por
  `config.sudo.methods`. Não é bug, é a consequência inevitável de exportar
  `completeSudo` — o `oidcStepUp` exige isso, porque quem valida o grant é o
  callback do host.

  ***

  ### Novos exports

  `sudoMethods`, `completeSudo`, `sudoContextFrom`, `failSudo`,
  `LAST_METHOD_SESSION_KEY` e os tipos `SudoMethod`, `SudoContext`,
  `SudoMethodDescriptor`, `SudoRouteHelpers`.

  `completeSudo` é público porque o host PRECISA chamá-lo: `oidcStepUp` não
  registra rotas — quem valida o grant é o callback do host. `markSudo` continua
  exportada mas está `@deprecated`: ela grava a marca e nada mais (sem audit
  `sudo.confirmed`, sem preferência de método, sem redirect para o `return_to`).

  ***

  ### BREAKING — telas custom da view `account/confirm`

  As props mudaram de `{ passwordless, passkeyAvailable }` para
  `{ methods, preferredId, notice }`:

  - `methods`: `Array<{ id, labelKey, kind: 'form' | 'action' | 'redirect' | 'webauthn', endpoint, fields? }>`;
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

  O caminho de reconfirmação continua existindo para todo mundo, inclusive para
  contas passkey-only em host Edge: o template embutido roda o handshake WebAuthn
  completo (ver `kind: 'webauthn'` abaixo). Quem usa renderer próprio
  (React/Inertia) precisa garantir que a sua tela também o faça.

  ***

  ### Comportamentos deliberados, para não parecerem bug

  **O login primário concede sudo à revelia de `config.sudo.methods`.** É correto
  e intencional: autenticação primária recente É confirmação de identidade — o
  modelo do GitHub. `sudo.methods` governa a TELA DE RE-CONFIRMAÇÃO (o que
  oferecer a quem já está logado há um tempo), não o login. Um host que remova
  `password` de `sudo.methods` continua vendo sudo concedido logo após um login
  por senha, e isso não é a config sendo ignorada.

  **`kind: 'webauthn'` — um método pode exigir JavaScript, e a tela sabe disso.**
  WebAuthn não é um submit: o navegador tem de buscar as options, assinar o
  challenge e só então postar a assertion. Renderizado como form comum, o campo
  `response` vai vazio e o handler recusa sempre. Por isso `passkey().describe()`
  devolve `kind: 'webauthn'` (não `'action'`), e o template embutido roda o
  handshake: pede `POST <endpoint>/options`, chama `startAuthentication` e posta a
  assertion serializada em `<endpoint>`.

  O kind é genérico de propósito — o endpoint de options é DERIVADO do descritor
  (`<endpoint>/options`) e a tela não conhece o id `passkey`. Qualquer método do
  SPI que implemente o mesmo par de rotas ganha a tela embutida de graça.

  Renderer próprio (React/Inertia) precisa tratar `'webauthn'`: um kind
  desconhecido caindo no ramo de form produz exatamente o botão que nunca
  funciona.

  ***

  ### Correções

  - **Escalação via impersonação (segurança).** A marca de sudo não era vinculada
    à conta, e a impersonação troca a conta da sessão sem invalidá-la: dentro da
    graça de 15 min, o sudo do admin valia sobre a conta impersonada — e o do
    impersonado, de volta sobre o admin. A marca agora carrega o `accountId`
    e `isSudoActive` recusa quando não bate.
  - **`completeSudo` recusa sem conta carregada.** `sudoContextFrom` deixa
    `account: null` quando o `accountStore` não acha a conta (sessão viva de conta
    apagada/anonimizada). Os built-in já checavam por dentro; agora o ÚNICO ponto
    de concessão impõe, então um método que não cheque também fica seguro — mesma
    garantia estrutural de `guardSudoRoutes`, do outro eixo.
  - **`accountHome` nunca era propagado ao config resolvido**, então o redirect
    pós-confirmação sempre caía no default `/account/security`, ignorando o valor
    do host.
  - **`isPasswordless`** foi removido; o docblock descrevia uma heurística com
    passkeys que o código não implementava.

  ***

  ### Rate limit nas rotas dos métodos de sudo

  TODA rota registrada por um `SudoMethod` leva o throttle do host (no-op quando o
  rate-limit está desligado). Importa sobretudo para o POST que emite o magic link
  de sudo, que dispara um e-mail por chamada: o `accountGuard` na frente só exige
  uma sessão de conta viva, que o abusador tem.

  O bucket é PRÓPRIO do sudo (`authkit_sudo`), keyed por IP e com os MESMOS
  limites do login (10/min) — o que muda é a CONTAGEM, não o teto. Os dois
  orçamentos respondem a perguntas diferentes: `login` mede um anônimo adivinhando
  credenciais, `sudo` mede um usuário JÁ autenticado reprovando a própria
  identidade na tela de confirmação. Compartilhados, contaminavam-se nos dois
  sentidos — quem errasse a senha no `/account/confirm` ficava sem conseguir logar
  em outra aba, e um ataque de credencial no login trancava a confirmação de quem
  está legitimamente logado atrás do mesmo NAT.

  Aplicado no WRAPPER de registro (`guardSudoRoutes`), não pelo método. Isso é
  deliberado e é a mesma escolha da barreira de `config.sudo.methods`: um método
  que pudesse PEDIR throttle poderia também não pedir, e a cobertura voltaria a
  depender de o autor lembrar. Métodos customizados ganham o throttle sem fazer
  nada, e `SudoRouteHelpers` não precisou mudar de forma.

## 0.45.0

### Minor Changes

- 257131f: Avatar storage can now delegate to `@adonis-agora/media` when it is installed (declared as an optional peer). New `uploads.avatars` config: `storage` (`'auto'` | `'builtin'` | `'media'`, default `'auto'`), `collection` (default `'avatar'`), and `ownerType` (default `'AuthAccount'`). When media is present it stores the avatar via media's `single-file` helper and persists the returned URL; otherwise it falls back to the built-in `@adonisjs/drive` uploader (behavior unchanged). Adds an exported `isAvatarUploadSupported()` used to gate the avatar file input on whichever backend is actually available.

## 0.44.0

### Minor Changes

- 1dc4233: The admin console now resolves an account's roles through `resolveTokenRoles` when configured — the same source the OIDC `roles` claim is minted from — so an app-role admin (e.g. one whose roles live in a `@adonis-agora/authz` table) reaches the console without needing the role duplicated in `auth.users.global_roles`. Applies to the `adminGuard` route gate and the console shell's current-user display. Default is unchanged: with no `resolveTokenRoles` configured, both fall back to `account.globalRoles`.

## 0.43.0

### Minor Changes

- 304722c: Add a pluggable `resolveTokenRoles` hook to source the global-roles claim from an external authority (e.g. `@adonis-agora/authz`) or a custom store at token-mint time. Applies to both the authorization-code flow (first-party only) and token exchange. Default unchanged (`account.globalRoles`).

## 0.42.0

### Minor Changes

- a09ded9: `@vinejs/vine` passa de `dependencies` para `peerDependencies` (range `^4.3.0`). Como lib do ecossistema AdonisJS, o vine deve ser fornecido pelo app consumidor — embuti-lo criava uma segunda cópia do vine e, como o `@adonisjs/core` é peer-chaveado pelo vine, uma segunda instância do core no bundle do consumidor (quebra de boot: `Cannot read properties of undefined (reading 'booted')`). Todo app AdonisJS já tem o vine instalado.

## 0.41.0

### Minor Changes

- 878bb0d: Permite configurar o remetente (`from`) dos e-mails internos da lib (alertas de novo acesso/dispositivo, reset de senha, verificação, magic link default, avisos de segurança) via `defineConfig({ mail: { from } })`. Tem prioridade sobre o `from` global do `config/mail.ts` do host — assim o auth pode usar um remetente próprio (ex.: `Segurança <no-reply-auth@dominio>`) sem trocar o remetente dos e-mails gerais do app. Sem `from` em lugar nenhum, o envelope MAIL FROM ficava vazio e provedores como o Resend rejeitavam com `550 Invalid from`; agora o `defaultFrom` resolve authkit → host → default do @adonisjs/mail.

## 0.40.0

### Minor Changes

- eec8b82: Add RP-side session-impersonation helpers (`rememberAccessToken`, `startImpersonation`, `impersonationState`, `stopImpersonation`) in `src/host/impersonation_session.ts`.

  These give a relying party a reusable, ergonomic way to impersonate a user and browse as them. The flow is routed through the IdP's existing RFC 8693 token-exchange, so it inherits the IdP's central audit trail and the `act` claim — the IdP stays the sole authorization gatekeeper (a non-admin `subject_token` is rejected, so the session is only swapped on a successful exchange). The helpers are pure session glue over the `account_user_id` key, with anti-fixation session regeneration on start/stop.

## 0.39.0

### Minor Changes

- 67feccb: Adiciona o acessor singleton `@adonis-agora/authkit-server/services/main` (convenção `services/main` do
  Adonis, como `@adonisjs/lucid/services/db`, `@adonisjs/drive/services/main` e `@adonisjs/lock/services/main`).
  Deixa o app usar `import authkit from "@adonis-agora/authkit-server/services/main"` e ler `authkit.config` /
  acessar `authkit.provider` etc., em vez de resolver a binding string-keyed `"authkit.server"` pelo container
  na mão (`ctx.containerResolver.make("authkit.server")`). Funciona tanto em controllers-classe quanto em
  route handlers inline.

  Espelha o que o `authkit-client` já expõe. A binding `"authkit.server"` continua registrada e é a forma
  suportada de resolver o serviço DENTRO da lib — que é o idioma das libs first-party do Adonis (ver
  `@adonisjs/auth`, que resolve `ctx.containerResolver.make("auth.manager")` no próprio middleware).

## 0.38.1

### Patch Changes

- 4ac368e: Corrige: os re-renders do passo de login (erro de senha, lockout, magic link enviado, e-mail não
  verificado) mandavam `authMethods` undefined pra view — só o GET `show()` passava. Com `authMethods`
  ausente, a tela voltava ao default (senha ligada), **ignorando `cfg.authMethods` / o setting de runtime**:
  o input de senha aparecia mesmo com `authMethods: { password: false }`.

  Agora um helper `#loginMethods(ctx, cfg)` resolve os métodos efetivos (com os pins do config) e todos os
  renders do passo login passam `authMethods` + `magicLinkAvailable`. O input de senha respeita a config em
  qualquer caminho de render.

## 0.38.0

### Minor Changes

- 3b26725: Console admin: a página **Settings** agora é plugada nas settings de runtime REAIS de `auth_settings`
  (antes eram keys placeholder que não batiam com nenhum resolver). Cada seção mapeia uma
  `SETTING_KEYS` estruturada e edita seus campos, gravando o objeto inteiro via `PUT /api/settings/:key`.

  Seções: **Métodos de login** (`auth_methods` — password/magicLink/passkey/forgotPassword/passkeyAutofill),
  Cadastro (`registration`), Verificação de e-mail (`require_verified_email`), Manutenção
  (`maintenance_mode`), Lockout (`lockout`), TTL dos tokens (`token_ttl`).

  Settings travadas via `defineConfig()` (config-locks) aparecem com o selo "definido via config",
  os controles desabilitados e o aviso "Travado no defineConfig() — config tem prioridade sobre runtime".
  Ex.: `defineConfig({ authMethods: { password: false } })` deixa a seção Métodos de login read-only.

## 0.37.0

### Minor Changes

- 2fc6371: `defineConfig` agora aceita `authMethods` para FIXAR métodos de login pelo arquivo de config, com
  PRIORIDADE sobre o runtime setting `auth_methods` (integra ao mecanismo de config-locks existente).

  Declarar `authMethods` trava a key `auth_methods`: o valor do config manda, o console admin/Admin API
  não altera em runtime (rejeita com 423) e a UI lê `lockedSettingKeys()` pra desabilitar o controle.
  Cada campo declarado (`password`, `magicLink`, `passkey`, `forgotPassword`) sobrescreve o resolvido do
  setting. Guards preservados: ligar respeita a capacidade (magicLink/passkey só ligam se capable);
  desligar sempre vale; fail-safe all-off volta aos defaults (nunca tranca todo mundo pra fora).

  ```ts
  // Login sem senha (magic-link + passkey), fixado pelo config — sem comando por ambiente:
  defineConfig({
    authMethods: { password: false },
    passwordless: { magicLink: true },
  });
  ```

  Substitui a necessidade de rodar `node ace authkit:disable-password` por ambiente quando o objetivo é
  declarar a política no código.

## 0.36.0

### Minor Changes

- f919d69: Add passwordless public signup (`passwordless.signup`)

  When `passwordless: { signup: true }` (and the account store implements
  `MagicLinkCapability`), the public signup asks for e-mail + name only — no
  password. It creates the account with an unusable random password (same
  precedent as social-identity accounts), issues a magic link, and e-mails it;
  opening the link finishes the login through the existing magic-link flow. The
  response is uniform ("link sent") whether or not the account already exists
  (anti-enumeration), and an existing e-mail simply gets a login link. The
  password-based signup is unchanged when the flag is off.

## 0.35.0

### Minor Changes

- c3e0309: Add optional `@adonisjs/auth` integration. `authkitUserProvider()` plugs authkit's own `accountStore` into `@adonisjs/auth`'s `sessionGuard()` (for `config/auth.ts`), and a new `adonisAuth: { guard: '...' }` option in `config/authkit.ts` makes `AccountSessionController#login`/`logout` (and the other self-service logout endpoints) also call `ctx.auth.use(guard).login()/.logout()` — so `ctx.auth.user`, `middleware.auth()`, and Bouncer's `() => ctx.auth.user` now work for apps built on authkit. Fully opt-in and additive: `ctx.auth` is never touched unless both the guard is configured in `config/authkit.ts` and `@adonisjs/auth` is actually installed and initialized.

### Patch Changes

- 2d55d68: Fail fast and loudly at boot when `config/app.ts` is missing `appKey`, instead of only surfacing a `RuntimeException` lazily the first time something resolves the `authkit.server` binding (which could otherwise be silently swallowed by the keystore-reload poller/key-rotation scheduler's fail-safe `.catch(() => null)`, or surface as an unexplained 500 on the first `/account/*` request).
- 25ef01f: Default `render` to `edgeRenderer()` when `config/authkit.ts` omits it. Previously `render` had no runtime default: every `/account/*` and `/auth/interaction/*` request would throw `TypeError: render is not a function` (a 500 with no explanation) the moment a controller called `cfg.render!(...)`.
- 70f5721: Ship peer dependencies as ranges instead of exact versions

  `peerDependencies` pointed at the pinned `adonis`/`frontend` catalogs, and pnpm
  inlines a catalog's literal value at publish time — so every published peer came
  out exact. `@adonis-agora/authkit-server@0.34.1` on npm requires
  `"@adonisjs/core": "7.3.3"`, which no app on 7.3.5 can satisfy;
  `@adonis-agora/authkit-react@0.13.0` requires `"react": "19.2.6"`, which locks
  out every consumer not on that exact patch.

  Peers now resolve from three new range-only catalogs (`adonisPeers`,
  `frontendPeers`, `miscPeers`). Dependencies keep the pinned catalogs — a pin is
  right for reproducible installs and wrong for consumer compatibility, and the
  two were sharing one source.

  No source or runtime behaviour changes.

## 0.34.1

### Patch Changes

- 84190a1: Redact PII from the audit→diagnostics bridge so a deleted account's data never survives in Telescope's store (LGPD/GDPR completeness).

  The diagnostics bridge mirrors every `AuditEvent` onto the `@agora/diagnostics` bus, where Telescope captures it as an independent `diagnostic` entry in its own store — a store the account-deletion cascade's `anonymizeAudit` step does not reach. The bridge now emits a **redacted projection** of each event: `email`, `ip`, and the free-form `metadata` (which can itself carry addresses such as `oldEmail`/`newEmail`) are dropped at the source, leaving only the event `type` and the opaque internal ids (`accountId`/`actorId`/`clientId`) the security dashboard needs. The Telescope dashboard's token-activity table drops its now-empty "IP" column. The `onEvent` callback and outbound `webhook` integrations are unchanged — they still receive the complete event.

## 0.34.0

### Minor Changes

- 394b9aa: Bridge audit events to the @agora diagnostics bus; populate @agora context from the resolved session
- 0542665: Re-scope to @adonis-agora/authkit-\* (join the Agora ecosystem)
- 93fef40: Opt-in durable workflows for GDPR account deletion (sync-logout + async cascade) and export
- d98ad01: Add a Telescope auth-dashboard extension (defineAuthkitTelescopeExtension)

### Patch Changes

- Updated dependencies [0542665]
  - @adonis-agora/authkit-core@0.7.0

## 0.33.1

### Patch Changes

- e76bcb4: Limpeza de qualidade (sem mudança de comportamento): fábrica canônica `resolveRuntimeSettings(ctx)` substitui ~16 cópias da resolução de RuntimeSettings (3 nomes diferentes) e elimina o cast `as any` (via `connectionName` tipado no AccountStore); validação de catálogo de role de org extraída para um helper puro reusado pelos caminhos admin e member-facing; `countAdmins` passa a usar uma capability opcional `AccountStore.countByGlobalRole` quando disponível (fallback paginado mantido).

## 0.33.0

### Minor Changes

- dd80bb8: Segurança (least privilege): a claim de papéis globais e as claims de organização saem do scope `profile` para um scope dedicado `roles`, e sua emissão é gated a clients first-party (`branding.firstParty`). Clients third-party NÃO recebem papéis/org, mesmo solicitando o scope `roles`. O default de scopes do authkit-client passa a incluir `roles` (consumidores first-party continuam recebendo papéis sem mudança de comportamento). BREAKING para quem dependia de papéis no scope `profile`: o client precisa solicitar o scope `roles`.

## 0.32.0

### Minor Changes

- 685755c: MFA agora é totalmente lib-owned: o estado de TOTP/recovery/anti-replay (`totp_secret`, `mfa_enabled_at`, `recovery_codes`, `last_totp_step`) migra das colunas na tabela `users` do host para uma tabela própria auto-gerida `auth_mfa` (schema das tabelas da lib). Apps NÃO precisam mais de migration para MFA — o `withMfa()` continua sendo composto no model mas não declara mais colunas. Sem migração de dado para quem ainda não tem MFA enrolado; quem já tem precisa copiar as colunas para `auth_mfa`.

## 0.31.0

### Minor Changes

- 6c0dbb6: Correções de segurança (auditoria 2026-06-08):

  - Token-exchange travado: subject_token deve ser do client autenticado, scope reduzido à interseção com o client (scope inválido → `invalid_scope`), audience/resource não suportado rejeitado.
  - Allowlist de grant_types nos clients (bloqueia `implicit`); redirect/post-logout URIs validados como URI http/https absoluta.
  - Proteção de "último admin" + bloqueio de auto-rebaixamento; REST API valida globalRoles contra o catálogo; throttle por IP no grupo admin-api; auditoria REST registra o id (hash) da admin key em vez de null.
  - IDOR cross-org corrigido: revogação de convite escopada por organização; role de membro/convite validada contra o catálogo (sem promoção a `owner` por admin não-owner).
  - Login resistente a enumeration por timing (dummy-hash); settings de lockout/verified-email/expiração passam a valer em runtime no fluxo OIDC E no login de sessão do console; reset/troca de senha revoga sessões/grants OIDC; `/account/login` com throttle por IP + email normalizado.
  - Sessão regenerada no login (anti-fixation) e destruída no logout; TOTP com proteção de replay; encrypter de conta fail-closed (decrypt falho → nega, não devolve ciphertext); single-session propaga revogação cookie-based; `return_to` rejeita backslash (open redirect).

  **MIGRAÇÃO NECESSÁRIA (anti-replay TOTP):** o mixin de MFA agora declara a coluna `last_totp_step` (bigint, nullable) na tabela de contas do host. Hosts que usam TOTP DEVEM adicionar a coluna numa migração antes de subir esta versão, senão o primeiro login TOTP pós-upgrade falha ao persistir o step. Ex.: `table.bigInteger('last_totp_step').nullable()`.

## 0.30.0

### Minor Changes

- a450edb: Página "Signing Keys" no console admin: ver chaves JWKS (kids/idade/ativa), configurar rotação automática (enabled/maxAgeDays/keep), rotacionar agora e desabilitar todas + criar nova. O status de keys (`GET {base}/keys`) agora inclui a lista de chaves (`KeysStatus.keys`).

## 0.29.0

### Minor Changes

- a39352e: feat: drivers de cofre cloud do keystore JWKS via packages externos. O driver
  `{ driver: 'aws-secrets-manager' | 'gcp-secret-manager' | 'azure-key-vault' }` agora
  resolve para um `LazyExternalVault` que carrega o package dedicado no primeiro I/O
  (erro claro pedindo pra instalar se ausente). HashiCorp já está em core.
- 6fe2aa7: feat: rotação automática de chaves JWKS (age-based) + política + endpoints + SDK.

  Nova setting `key_rotation` (`{enabled,maxAgeDays,keep}`, default OFF). Um scheduler
  de housekeeping (web-only, fail-safe) rotaciona a chave quando ela passa de
  `maxAgeDays` e aplica AO VIVO (sem restart, via `reloadKeys` da Fatia C), com
  single-flight via `@adonisjs/lock` (peer opcional; sem ele assume single-instance).
  `OidcService` ganha `rotateKeys()`/`keystoreAgeDays()` (rotate+reload serializados).

  Dois tiers de endpoint admin para status + "rotacionar agora":

  - **REST API** `GET/POST /api/authkit/v1/keys` (Bearer key) — para backend/automação;
  - **Console API** `GET/POST {adminPrefix}/api/keys` (sessão + role admin) — para o browser.

  `@adonis-agora/authkit-sdk` expõe `authkit.keys.status()` / `authkit.keys.rotate()`
  (drivers remote + embedded). `@adonisjs/lock` é peer OPCIONAL.

  Default OFF: nada rotaciona automaticamente até um admin habilitar `key_rotation`.

- 93eaf69: feat: cofre do keystore JWKS no HashiCorp Vault (KV v2). Novo driver
  `{ driver: 'hashicorp-vault', endpoint, path, token?, mount?, field? }` — usa a API
  HTTP do Vault (sem SDK), então mora em core como file/drive/lucid/redis. Encryption
  at-rest fica OFF por default (o Vault tem cifra/ACL próprios; ligável p/ envelope).
- e2582b8: feat: cofres do keystore JWKS em Lucid e Redis. Novos drivers `jwks.store`:
  `{ driver: 'lucid' }` (tabela dedicada `authkit_keystore`, auto-criada) e
  `{ driver: 'redis' }` (uma key). Diferente de `file`, ambos são COMPARTILHADOS entre
  instâncias — o melhor default para multi-instância + hot-reload (o poll lê um `head`
  barato). Encryption at-rest (APP_KEY) ON por default nos dois. Warning no boot quando
  `redis` é usado (exige persistência RDB/AOF). `resolveKeystoreVault` agora recebe um
  contexto com acesso ao container (mudança de assinatura interna).

### Patch Changes

- Updated dependencies [93eaf69]
- Updated dependencies [e2582b8]
  - @adonis-agora/authkit-core@0.6.0

## 0.28.0

### Minor Changes

- df4b41f: feat: keystore JWKS managed com cofre pluggável + encryption at-rest (Fatia A+B)

  O keystore managed deixa de ser fs-síncrono-num-path e passa por uma abstração de
  cofre (`KeystoreVault`): `file` (default) e `drive` (`@adonisjs/drive`, bucket), com
  contrato para cofres custom. O keystore PRIVADO agora é encriptado em repouso por
  default (APP_KEY) para file/drive via um envelope versionado; decrypt falho lança
  (nunca regenera em silêncio). O boot e o comando `authkit:keys:rotate` usam o mesmo
  stack (defaults de encryption idênticos). Novidades: aviso no boot quando
  `jwks: 'auto'` cai no fallback de disco, e idade da chave de assinatura no
  `authkit:doctor`. Config: `jwks.store` aceita `{ driver: 'file' | 'drive' | ... }`
  além de string, e novo `jwks.encrypt`.

  Nota (0.x): sem migração de keystore legado — um `tmp/authkit_jwks.json` plaintext
  pré-existente deve ser apagado uma vez (regenera encriptado).

- fc68930: feat: hot-reload das chaves de assinatura JWKS — a chave rotacionada passa a
  assinar SEM restart. `OidcService.reloadKeys()` reconstrói e troca a instância do
  oidc-provider ao vivo (o estado durável vive no adapter, então nada se perde), e um
  poll do `head` do cofre (a cada 60s, só no processo web) propaga rotações feitas por
  outro processo/instância — ex.: `authkit:keys:rotate` num worker, ou outra réplica.

### Patch Changes

- 237c542: fix(console): "Sign out" do console admin agora desloga de verdade

  O botão de logout do console (`Sidebar`) era um `<a href="/account/login">` — não
  encerrava a sessão. Como a sessão seguia ativa, o `/account/login` redirecionava
  pro `accountHome` (default `/account/security`), então o usuário "deslogava" mas
  continuava logado, caindo numa tela de conta. Agora é um `<form method="POST"
action="/account/logout">` com CSRF, que faz `session.forget` e redireciona pro
  `/account/login` de verdade.

- Updated dependencies [df4b41f]
  - @adonis-agora/authkit-core@0.5.0

## 0.27.0

### Minor Changes

- 54535a7: refactor: controllers do admin (Admin REST API + console) validam input com VineJS

  Os controllers administrativos liam o body na mão via `ctx.request.input(...)`
  com coerção ad-hoc (`asArray`, checagens de presença) e devolviam `400`
  `invalid_request` quando faltava campo — sem schema, o que originou o bug do
  `grantTypes` vs `grants`. Agora cada recurso tem um validator VineJS em
  `host/admin_validators.ts` (compartilhado entre a Admin REST API e o console, que
  têm as mesmas formas de input) chamado via `request.validateUsing(...)`.

  Migrados: **clients** (create/update), **users** (create/update/roles),
  **organizations** (create/update/membros/convites), **catálogo de roles**
  (create/update), **sessions** (`revoke-all` — accountId por query/param validado
  direto com `validator.validate(...)`) e **tokens/verify**.

  **BREAKING (admin API):** input inválido agora responde `422` com o envelope de
  erro do VineJS (`{ errors: [...] }`) em vez de `400` `{ error: { code:
'invalid_request' } }`. A política de senha continua no `AdminUsersService`
  (o validator de criação de usuário NÃO fixa `minLength` — não duplica a policy
  configurável do projeto). O merge do PATCH de client (campos ausentes preservados)
  e o alias `grants`↔`grantTypes` seguem funcionando.

  Forms Edge (account/orgs, confirm, session), blobs WebAuthn, flags de checkbox,
  o endpoint RFC 7662 de introspecção e inputs opcionais-com-default ficam de fora
  de propósito (ver o doc no topo de `admin_validators.ts`).

## 0.26.2

### Patch Changes

- fe2c300: fix: admin client update (PATCH) agora MESCLA em vez de resetar campos não-enviados

  O update de client da Admin API/console fazia full-replace: campos ausentes no
  body caíam no default — não mandar `tokenEndpointAuthMethod` virava o client
  `confidential` (client_secret_basic), e não mandar grants derrubava grants como
  `token-exchange`. Agora o `update` preserva os valores atuais para qualquer campo
  não enviado (PATCH de verdade). Além disso, os controllers passam a aceitar `grants`
  (o mesmo nome do dto de saída) como alias de `grantTypes` na entrada.

## 0.26.1

### Patch Changes

- db8879e: Expõe `clientId` no `brand` das telas de auth

  O `brandFor()` agora inclui o `clientId` (OIDC) no objeto `brand` passado a cada tela renderizada. Hosts com IdP único e múltiplos produtos podem escolher tema/shell por client de forma robusta (`REGISTRY[brand.clientId]`) em vez de casar por `appName`. Ver recipe "Per-client auth UI".

## 0.26.0

### Minor Changes

- 262eb79: Back-Channel Logout pronto para sessões cookie-based + DX do client

  Antes, fechar o gap de logout SSO em sessão cookie-based exigia escrever model + service + middleware à mão em cada app (e era fácil esquecer — deixando a sessão válida por até 30 dias após um logout SSO). Agora o AuthKit absorve isso:

  **`@adonis-agora/authkit-client`**

  - `lucidRevocationStore({ connection?, table? })` + interface `RevocationStore`: persistência append-only de revogações (sid/sub/revoked_at), sem precisar declarar model.
  - `BackchannelRevocationMiddleware` (subpath `/backchannel_revocation_middleware`): derruba a sessão revogada na próxima request.
  - `defineConfig({ backchannelLogout: { store } })`: deriva o `onBackchannelLogout` e expõe o store ao middleware.
  - `lucidMirror(Model, { sync, preload, injectGlobalRoles })`: factory do `resolveUser` "espelho local".
  - Middlewares prontos `auth_middleware` (com `roles`) e `silent_auth_middleware` (subpaths).
  - `buildAuthorizeUrl({ extraParams })`: anexa `audience`/`prompt`/`login_hint`/etc. sem manipular URL na mão.
  - `Authenticator.toSharedProps()`: `{ user, globalRoles, appRoles, abilities }` pronto p/ Inertia share.
  - `AuthkitClientManager.impersonate()` / `stopImpersonating()` / `isImpersonating()`: ciclo de impersonação (RFC 8693) gerenciado.
  - `registerOidcClient(router, { redirects, afterLogin, loginMiddleware })`: registra login/callback/logout (+back-channel) absorvendo PKCE/state/exchange/redirect-por-papel do OidcSessionController.

  **`@adonis-agora/authkit-server`**

  - Tabela `auth_session_revocations` gerenciada pelo `ensureAuthkitSchema()` (schema auto-manage) — compartilhável entre apps no mesmo banco.
  - Revogação em massa do admin (`AdminSessionsService.revokeAll`) grava uma revogação `sub` na tabela compartilhada → logout INSTANTÂNEO nos clients cookie-based (antes esperava o refresh token falhar, ~TTL do access token).
  - **Config locks (BREAKING semântico):** settings definidas no `defineConfig` ficam TRAVADAS — config vence e a UI/Admin API não pode alterá-las (`getSetting` → null p/ resolvers caírem no config; `setSetting`/`deleteSetting` → 423 `SettingLockedError`). O console mostra badge "definido via config" e desabilita o controle. Exports: `isSettingLocked`, `lockedSettingKeys`, `deriveLockedSettingKeys`, `SettingLockedError`.
  - **`encrypter` do TOTP agora é DEFAULT (BREAKING):** `lucidAccountStore` encripta o segredo TOTP com `APP_KEY` por padrão (`appKeyEncrypter()`); `encrypter: false` desliga. ⚠️ Segredos gravados em claro por versões anteriores deixam de decriptar — migre ou passe `false`.
  - `jwks: 'auto'` — resolve env-aware (`AUTHKIT_JWKS` inline, senão managed em arquivo); elimina o ternário no config.
  - `adminApi.apiKeys: 'env'` (lê `AUTHKIT_ADMIN_API_KEY`) + `enabled` auto quando há key — elimina o spread condicional.
  - `lucidStores({ account, pat, audit, providerIdentity, webauthnCredential, organizations }, { mfaIssuer, webauthn })`: monta os stores declarando mfaIssuer/webauthn UMA vez.
  - `defineConfig` reusa `mfaIssuer`/`webauthn` do `lucidAccountStore` quando o top-level não os fornece (declare uma vez).
  - `authkitCsrfExceptions(url, { mountPath })`: helper de isenção CSRF das rotas machine-to-machine.
  - **`registerAuthHost(router)` sem opts** — lê mountPath/social/rateLimit/admin/adminApi do `config/authkit.ts` (stash no boot do provider, que roda antes do preload do routes.ts). Acaba com o drift config↔registerAuthHost; `opts` viram só override (ex.: `{ admin: { prefix } }`). Fallback p/ defaults quando não há stash (testes).

## 0.25.3

### Patch Changes

- f67e75e: Logout deixa de mostrar a tela default do oidc-provider ("Do you want to sign-out from…?")

  O RP-initiated logout (end_session) usava o `logoutSource`/`postLogoutSuccessSource` default do oidc-provider — HTML sem estilo, em inglês, pedindo confirmação. Agora um splash de marca ("Saindo…", i18n en/pt-BR) auto-confirma o logout (injeta `logout=yes` e submete via JS, com `<noscript>` acessível), e a tela de sucesso (quando não há `post_logout_redirect_uri`) também é tematizada.

## 0.25.2

### Patch Changes

- fa2e89f: New `accountHome` config — and the account area no longer dumps users on the PAT screen

  Post-login at `/account/login` (without `return_to`), e-mail confirmations, and non-admin redirects away from the console used to land on `/account/tokens` (the Personal Access Tokens screen) — hostile for regular users. The default destination is now **`/account/security`** and is configurable via `accountHome` in `defineConfig` (point it at your app's home to land users straight in the product).

## 0.25.1

### Patch Changes

- e2086c2: Admin console: finish the nuqs URL-state migration and pin SPA deps
  - **nuqs URL state now covers every page.** The Audit and Sessions pages join Users and Orgs in keeping navigation and filter state (page, type filter, pagination) in the query string via [nuqs](https://nuqs.47ng.com/)'s generic React adapter — completing the migration shipped in 0.25.0. Every view + filter combination is deep-linkable and survives refresh; switching pages clears shared filter params so state never leaks between views. Ephemeral UI (modals/forms) stays in React state.
  - **Per-user "Disconnect all devices"** (shipped in 0.25.0, now documented): the admin user drawer's Actions row revokes a single user's sessions + grants via `POST {prefix}/api/users/:id/revoke-sessions` — the admin-side equivalent of the self-service "Sign out of all devices" on `/account/security`.
  - **Pinned SPA dependencies** to exact versions: `nuqs@2.8.9` and `recharts@3.8.1` (no `^` range).
  - **Console internals refactored for maintainability** (no behavior change): the 1.1k-line `orgs.containers.tsx` was split into focused modules (`org_settings.containers.tsx`, `org_members.containers.tsx`, shared `UserPicker` and form primitives); the org-settings forms got real types (`OrgPolicyValue`, `RolesCatalogValue`) with boundary normalization instead of `any`; `catch (err: any)` normalized to the canonical `unknown` pattern; the debounce hook deduplicated into `lib/use_debounce.ts`.

## 0.25.0

### Minor Changes

- 6a011b2: Admin console UX: real forms for org settings, user search everywhere, interactive charts
  - **Organization settings got a real UI**: `organizations_policy` is now a proper form (self-create toggle, invitation TTL, role chips editor) and `roles_catalog` an inline role list editor (name + description, ADMIN locked) — no more raw JSON textareas. A read-only summary of the effective value shows even when not editing.
  - **Linking users to an org no longer requires a UUID**: "Add member" and the create-org "Owner" field are now a user search (by email/name, debounced) with a picker; member/invite roles are selects instead of free-text.
  - **Overview charts are interactive**: sign-ins/sign-ups per day rebuilt with Recharts — gradient area, dotted grid, hover tooltip with per-day values (shadcn-style), replacing the static SVG sparkline.

## 0.24.0

### Minor Changes

- 55467df: Automatic schema management + admin console is React-only
  - **Schema auto-management (default on)**: AuthKit now creates its own tables on boot (`authkit_oidc_payloads`, `auth_settings`, `auth_password_history` and the three organizations tables) and additively adds columns introduced by updates — never drops or alters existing columns. Disable with `schema: { autoManage: false }` and call the new exported `ensureAuthkitSchema(db)` inside a migration you own (idempotent, additive). Runtime settings, password history and organizations now work out of the box.
  - **Edge admin console removed**: the React SPA is the only admin console. `admin: { ui: 'edge' }` and the `ui` config field are gone, along with the Edge admin controllers and views (~30 routes). The SPA was already the default; this deletes the parallel legacy surface.
  - **`views` autocomplete**: `inertiaRenderer({ views })` is now typed with the `AuthkitScreen` union — IDE autocomplete for every known screen name, still open for custom strings. The array is a set: order never mattered, now the docs say so.
  - Fix: packaging import-smoke no longer tries to import the console SPA's Vite bundles in Node.

### Patch Changes

- Export sudo mode helpers (`requireSudo`, `isSudoActive`, `markSudo`, `SUDO_SESSION_KEY`, `SUDO_MODE_DEFAULTS`, `resolveEffectiveSudoMode`, `SudoModeSetting`, `ResolvedSudoModeSetting`) from the server package so host applications can enforce step-up authentication in their own controllers.

## 0.23.0

### Minor Changes

- feat(account): global sign-out — revoke all sessions across all devices

  **Server (`@adonis-agora/authkit-server`):**

  - `POST /account/api/sessions/revoke-all` — revokes all OIDC sessions/grants for the account
    and terminates the current Adonis console session (global logout).
    Returns `{ ok: true, signedOut: true }` so the UI can redirect to login.
    Emits audit event `account.signed_out_all`.

  **React SDK (`@adonis-agora/authkit-react`):**

  - `RevokeAllResult` type (`{ ok, signedOut, ...rest }`)
  - `client.account.sessions.revokeAll()` method
  - `useAccountRevokeAllSessionsMutationOptions()` hook (account namespace;
    distinct from the admin `useRevokeAllSessionsMutationOptions`)

## 0.22.0

### Minor Changes

- feat(settings): org-scoped runtime settings (org → global → default resolution)
  - `auth_settings` table gains `organization_id` column (nullable; NULL = global). Unique constraint on (key, organization_id).
  - `RuntimeSettings` methods gain optional `orgId` param: `getSetting(key, orgId?)`, `setSetting(key, value, updatedBy?, orgId?)`, `deleteSetting(key, orgId?)`, `listSettings(orgId?)`. New `getEffective(key, orgId?)` helper resolves org → global → null.
  - Cache is org-scope-aware (cache key includes orgId).
  - `resolveEffectiveOrganizationsPolicy` and `resolveEffectiveRolesCatalog` accept optional `orgId` and resolve org → global → default. All other resolvers remain global-only.
  - Console JSON API (`/api/settings`) and Admin REST API accept `?organizationId=` query param for scoped reads/writes/deletes.
  - Org detail drawer in console admin shows "Organization Settings" section for org-scopable keys (`organizations_policy`, `roles_catalog`) with source badges (from org / from global / default) and inline JSON editor.
  - `@adonis-agora/authkit-react` client: `settings.list(orgId?)`, `settings.set(key, value, orgId?)`, `settings.remove(key, orgId?)`. `authkitKeys.admin.settings(orgId?)`. `useSettingsQueryOptions(orgId?)`, `useSetSettingMutationOptions(orgId?)`, `useRemoveSettingMutationOptions(orgId?)`.
  - `SettingEntry` type gains `organizationId: string | null` field.
  - Existing rows default to `organization_id = NULL` (global) — no data migration needed.

## 0.21.0

### Minor Changes

- feat(console): gestão completa de organizations no console admin React

  Adiciona CRUD completo de organizações na JSON API do console React
  (console_orgs_controller) e na SPA (Orgs.tsx + orgs.containers.tsx):

  **Novos endpoints no console React JSON API (`{adminPrefix}/api/orgs/*`):**

  - `POST   /api/orgs` → criar org (name + slug + ownerAccountId)
  - `PATCH  /api/orgs/:id` → editar nome/logo
  - `DELETE /api/orgs/:id` → remover org
  - `POST   /api/orgs/:id/members` → adicionar membro (accountId + role)
  - `PATCH  /api/orgs/:id/members/:accountId` → alterar role do membro
  - `DELETE /api/orgs/:id/members/:accountId` → remover membro
  - `POST   /api/orgs/:id/invitations` → criar convite (email + role)
  - `DELETE /api/orgs/:id/invitations/:invitationId` → revogar convite

  Todos os endpoints retornam 404 `capability_unsupported` quando o store não
  suporta organizações. Lógica reutiliza `AdminOrgsService` (sem duplicação).

  **SDK `@adonis-agora/authkit-react`:**

  - `client.admin.orgs`: novos métodos `addMember`, `removeMember`,
    `updateMemberRole`, `createInvitation`, `revokeInvitation`
  - Novos hooks: `useAddOrgMemberMutationOptions`, `useRemoveOrgMemberMutationOptions`,
    `useUpdateOrgMemberRoleMutationOptions`, `useCreateOrgInvitationMutationOptions`,
    `useRevokeOrgInvitationMutationOptions`

  **SPA do console:**

  - Botão "New organization" na header (modal com name + slug auto-gerado + ownerAccountId)
  - Empty state com CTA de criar
  - Drawer da org: editar nome/logo, deletar (com confirmação), listar membros com
    add/mudar-role/remover, convites pendentes com criar e revogar
  - Padrão containers + skeleton + QueryBoundary + toasts

  i18n: strings em inglês (interface do console); mensagens de erro do servidor em pt-BR.

## 0.20.3

### Patch Changes

- fix(console): register GET/POST api/users/:id/sessions routes before shell catch-all

  The admin React console drawer for a user was failing with "Unexpected token '<',
  '<!doctype'... is not valid JSON" because `GET {adminBase}/api/users/:id/sessions`
  and `POST {adminBase}/api/users/:id/revoke-sessions` were not registered in React
  mode — the catch-all served the SPA shell HTML instead of JSON.

  Adds `userSessions` and `userRevokeSessions` methods to `ConsoleSessionsController`
  (reusing the existing per-account logic via a private helper) and registers both
  routes before the `${ap}/*` catch-all in `register_auth_host.ts`.

## 0.20.2

### Patch Changes

- fix(sessions): listagem global no console admin quando accountId ausente
  - `ConsoleSessionsController.index`: sem `accountId` retorna lista global de todas as sessões ativas (todas as contas) em vez de 400
  - `AdminSessionsService.listAllSessions()`: enumera todas as sessões via adapter, resolve email por conta com cache (evita N+1), limita a 500 entradas com flag `truncated`
  - `AdminSession`: novo campo opcional `email`
  - `sessionDto`: inclui `email` na projeção JSON
  - `AdminSessionEntry` (react types): campo `email: string | null`
  - `UserSessionsResult` (react types): campo `truncated?: boolean`; renomeia `canList` → `supported` para alinhar com a resposta real do servidor
  - SPA `sessions.containers.tsx`: exibe email acima do accountId na coluna Account quando presente
  - Testes: cobre listagem global, truncamento a 500, capability ausente e resolução de email

## 0.20.1

### Patch Changes

- Fix "Failed to execute 'fetch' on 'Window': Illegal invocation": the typed client stored `globalThis.fetch` unbound and called it as an instance method, losing the Window binding. The default fetch is now bound to `globalThis`. The admin console SPA is also refactored into per-section containers, each with its own loading skeleton and a `react-error-boundary`-backed error state with retry.

## 0.20.0

### Minor Changes

- Typed front-end client, TanStack Query hooks, and account JSON API:
  - **Account self-service JSON API** (`/account/api/*`): session-authed, CSRF-protected endpoints for profile, security overview, password/email change, sessions, authorized apps, MFA/passkeys, PATs and organizations — the data layer for client-side account screens. Login/consent stay postback for security.
  - **Typed front-end client** in `@adonis-agora/authkit-react`: `createAuthkitClient()` (auto-reads `window.__AUTHKIT__`) exposing `client.admin.*` and `client.account.*`, plus `AuthkitClientError`.
  - **TanStack Query hooks** (Tuyau-style): ready-made `use*QueryOptions`/`use*MutationOptions` for every admin and account endpoint, structured `authkitKeys` for invalidation, `AuthkitClientProvider` + `createAuthkitQueryClient()`. `@tanstack/react-query` is a new peer dependency.
  - **Admin console SPA** now consumes these hooks internally (client-side fetching via TanStack Query) instead of a bespoke fetch wrapper.

## 0.19.0

### Minor Changes

- Helpers públicos da sessão do console: `getAccountId(ctx)`, `hasAccountSession(ctx)` e `consoleLoginUrl(returnTo?)` (+ re-export de `ACCOUNT_SESSION_KEY`) — para proteger rotas próprias e integrar pacotes de terceiros (ex.: adonis-telescope) sem depender de detalhes internos.

## 0.18.3

### Patch Changes

- Fix React admin console JSON API returning HTML ("Unexpected token '<'"): the shell catch-all `{prefix}/*` was registered before the `{prefix}/api/*` routes, and AdonisJS matches wildcards by registration order, so the catch-all swallowed every API request and served the HTML shell. The API and asset routes are now registered before the catch-all.

## 0.18.2

### Patch Changes

- Fix React admin console serving the "Build Required" fallback instead of the SPA: the Vite dist was emitted to build/host/ui-dist but the compiled admin_shell_controller (rootDir ./ → build/src/host/admin_console) resolves the dist at build/src/host/ui-dist, so the readFile always failed in production. Vite now outputs to the matching path and the build asserts the dist lands where the controller reads it.

## 0.18.1

### Patch Changes

- Fix boot crash with `admin: { ui: 'react' }`: the React shell was served from two GET routes (`{prefix}` and `{prefix}/*`) sharing the same controller+method, so AdonisJS auto-derived the same route name for both and threw "A route with name console_shell.serve already exists" at boot. The shell, asset and catch-all routes now carry explicit unique names.

## 0.18.0

### Minor Changes

- Rodauth parity completion + React admin console:
  - **Sudo mode**: `sudo_mode` setting + `/account/confirm` (password or passkey) re-confirmation with a grace window; `requireSudo` gates password/email change, account deletion, MFA/passkey management and PAT actions.
  - **OTP lockout**: `otp_lockout` setting locks the second factor after repeated TOTP/recovery failures and unlocks via emailed link (`GET /auth/otp-unlock/:token`, `onOtpUnlock` hook).
  - **Common-password block**: `password_policy.blockCommon` (default on) rejects the ~10k most common passwords offline, before the HIBP check.
  - **Account expiration**: `account_expiration` setting blocks login for accounts inactive beyond N days (reactivate via password reset) + `authkit:accounts:expire-scan` command for cron with warning emails.
  - **WebAuthn autofill**: `auth_methods.passkeyAutofill` enables conditional-mediation passkey suggestions on the login field; new `usePasskeyAutofill` React hook.
  - **React admin console (new default)**: `admin: { ui: 'react' }` serves a real Vite-built React SPA (build-and-serve, bundled in the package — zero host setup) with a dark/light telescope-style theme, consuming a session-authed JSON API under `{prefix}/api/*`. `ui: 'edge'` keeps the classic server-rendered console.

## 0.17.1

### Patch Changes

- Fix broken console templates in 0.17.0: the styles partial `@include` shared a line with `</head>`, which the Edge lexer cannot tokenize — every console page crashed. Do not use 0.17.0.

## 0.17.0

### Minor Changes

- Console UX:
  - **`return_to` on console login**: the account/admin guards now redirect to `/account/login?return_to=<original path>` and the login POST sends you back where you were heading (server-side validated, open-redirect proof). Custom login pages receive a `returnTo` prop and should propagate it as a hidden input.
  - **Roles catalog**: new `/admin/roles` page manages the global-role catalog (runtime setting `roles_catalog`; ADMIN is protected). The users page assigns roles via checkboxes from the catalog instead of free text; roles a user holds that left the catalog show an "out of catalog" badge and can only be removed. Doctor warns when `admin.roles` references a role missing from the catalog.

### Patch Changes

- 55eb9d7: Elimina o FOUC (flash de página sem estilo) em todas as telas server-rendered do host (login, account, console admin): o Tailwind Play CDN (gerava CSS em runtime no browser) foi substituído por CSS estático gerado no build e embutido inline via partial Edge.

## 0.16.0

### Minor Changes

- Breaking cleanup (0.x, no external consumers): every deprecation shim is gone.
  - Policy now lives ONLY in runtime settings (DB) with library defaults — removed from config: static `clients`, lockout policy fields (`store` stays), rate-limit buckets (`enabled`/`store` stay), `notifications`, trusted-devices `enabled`/`days`, `admin.impersonation`, organizations `roles`/`allowSelfCreate`/`invitationTtlHours`, and `password.policy`/`password.checkPwned` store options (`legacyVerifier`/`pepper`/`pwnedTimeoutMs` stay — they are code/infra).
  - Removed commands `authkit:clients:import` and the legacy `authkit:rotate-keys` alias. New `authkit:clients:create` creates OIDC clients programmatically through the configured storage (confidential secret printed once; `--public`, repeatable `--redirect-uri`/`--grant`, `--json`).
  - Removed the no-op `passthroughParsed` option from `jsonColumn` and the `checkLegacyPolicyConfig` doctor check.

### Patch Changes

- Updated dependencies
  - @adonis-agora/authkit-core@0.4.0

## 0.15.2

### Patch Changes

- Fix RuntimeSettings against a real Lucid database: queries used `db.table()` (Lucid's INSERT query builder) for SELECT/DELETE, so the table probe always failed and every runtime setting reported "table absent" on real hosts. Reads/deletes now use `db.from()`; verified end-to-end against Postgres on a named connection.

## 0.15.1

### Patch Changes

- RuntimeSettings now probes the `auth_settings` table with a real `SELECT` (search_path-aware) instead of `schema.hasTable`, and follows the account store's named connection (`lucidAccountStore` exposes `connectionName` from the model). Hosts storing auth on a named connection (e.g. `connection: 'auth'`) no longer see every runtime setting as "table absent".

## 0.15.0

### Minor Changes

- Rodauth parity + runtime-first management:
  - **Verified email change** (`verify_login_change`): logged-in users change their email with confirmation sent to the NEW address and a security warning to the CURRENT one; cancellable, hashed tokens, `email_change` runtime setting, `onEmailChangeConfirm`/`onEmailChangeNotice` mail hooks.
  - **Security notification emails**: automatic notices for password changed, MFA enabled/disabled, passkey added/removed and email changed — `security_notifications` setting, `onSecurityNotice` hook overrides defaults.
  - **Advanced password hygiene**: password reuse history (optional `auth_password_history` table + `password_history` setting), password pepper (`password.pepper: string | string[]` with rotation and lazy re-hash), password expiration (optional `password_changed_at` column + forced change step at login), email-verification grace period (`require_verified_email.graceDays`).
  - **Session policies** (`session_policy` setting): explicit remember-me checkbox backed by oidc-provider transient sessions + runtime TTL holder, single-session enforcement (revokes other sessions on login), idle timeout for the account/admin consoles.
  - **Runtime-first management**: 18 runtime setting keys are now the single source of policy (setting > legacy config fallback > library default) — lockout, rate-limit buckets, password policy/HIBP, notifications, trusted devices, token TTLs (live via holder), admin impersonation and organizations policy join the existing toggles; legacy config policy fields are deprecated (kept as fallback) and reported by the new doctor check; new `authkit:settings:list|get|set|unset` ace commands write through the configured storage; the admin settings page is organized into sections.

## 0.14.0

### Minor Changes

- Render seam hardening for SSR hosts:
  - **Admin console always renders the built-in edge views** — the management area is library chrome, never routed through the host's custom renderer (custom-rendered hosts were 500ing on `/admin` because no `admin/*` pages exist on the host).
  - **`inertiaRenderer({ prefix, views?: string[] })`**: with the new `views` allowlist only listed screens go through Inertia; everything else silently falls back to the built-in edge views instead of crashing SSR with "Cannot read properties of undefined (reading 'default')" when the host page doesn't exist. Omitting `views` keeps the previous behavior. The react configure stub now scaffolds the allowlist.

## 0.13.1

### Patch Changes

- Fix Postgres json/jsonb columns crashing model hydration: `jsonColumn`'s `consume` blindly `JSON.parse`d every value, but Postgres drivers return json/jsonb columns already deserialized (objects/arrays) — hydrating `global_roles` blew up with `"[object Object]" is not valid JSON` (500 on the admin console right after login). `consume` now passes non-strings through, parses strings, and falls back safely on invalid JSON. The `passthroughParsed` option is deprecated (always on).

## 0.13.0

### Minor Changes

- Configurable Admin REST API prefix: `registerAuthHost(router, { adminApi: { prefix: '/authkit/api' } })` mounts the API under a custom prefix (default `/api/authkit/v1` unchanged; `adminApi: true` keeps working). The SDK remote driver gains a matching `apiPrefix` option in `createAuthkit`.

## 0.12.0

### Minor Changes

- Embedding & login-surface control:
  - **Configurable admin console prefix**: `registerAuthHost(router, { admin: { prefix: '/auth/admin' } })` mounts every console route, view link and redirect under a custom prefix (default `/admin`; `admin: true` unchanged). Admin REST API path is unaffected.
  - **`auth_methods` runtime setting**: choose from the admin UI which login methods the screens offer — password, magic link, passkey and which configured social providers. `forgotPassword` is auto-derived (no password method → no forgot-password link/endpoints), the social list intersects with code-configured providers, and an all-off setting fail-safes back to config defaults. New "Authentication methods" card in `/admin/settings` with dependency hints, plus doctor checks.

## 0.11.2

### Patch Changes

- `authkit:doctor` jwks check now reads the input shape (`jwksConfig`) instead of the materialized keyset, restoring the "managed without store = ephemeral key per boot" warning on resolved configs.

## 0.11.1

### Patch Changes

- Fix ace commands reading the raw config provider: `authkit:doctor`, `authkit:users:import`, `authkit:keys:rotate` and the legacy `authkit:rotate-keys` read `config.get('authkit')` directly, which returns the UNRESOLVED config provider that `defineConfig` exports — so every field (issuer, accountStore, jwks) looked missing against a perfectly valid host config. The commands now resolve the provider via the new `resolveAuthkitConfig` helper (plain-object configs still pass through). The resolved config also gains `jwksConfig`, an echo of the jwks INPUT shape (source/store/algorithm), since the resolved `jwks` is the materialized keyset and loses those fields needed by key rotation.

## 0.11.0

### Minor Changes

- Runtime-first administration:
  - **Three new runtime toggles** (auth_settings-backed, with admin console cards showing effective state): `registration` (open/close self-service signup without affecting org invites or admin-created users; static fallback `registration.enabled`), `require_verified_email` (overrides `login.requireVerifiedEmail` across password/magic-link/passkey flows), and `maintenance_mode` (`{ enabled, message? }` — blocks login/signup/forgot for non-admins with a maintenance page while admin accounts keep logging in; userinfo/introspection/existing sessions keep working; the Admin API is never blocked, providing a guaranteed escape hatch). Audit events `maintenance.enabled`/`maintenance.disabled`.
  - **Clients are now managed at runtime** (admin console + Admin REST API are the canonical path): the static `clients` config field is optional and deprecated (boot warning, doctor warning, console banner). New `authkit:clients:import` ace command (`--dry-run`) migrates config clients to the adapter preserving secrets and skipping existing ones. Booting with zero configured clients is fully supported. New doctor check warns when clients live in a volatile adapter. Backchannel logout URI/session-required are now editable via console and API.

### Patch Changes

- Updated dependencies
  - @adonis-agora/authkit-core@0.3.1

## 0.10.0

### Minor Changes

- Runtime settings + bot protection UI toggle:
  - **Runtime settings store**: optional capability-probed `auth_settings` table with `SettingsCapability`, `supportsSettings` type guard and a `RuntimeSettings` service (15s TTL cache, fail-safe fallback to static config on any DB error or missing table).
  - **Bot protection runtime toggle**: the `bot_protection` setting key (`{ enabled, on? }`) turns bot protection on/off and overrides protected actions without redeploying — the `verify` hook still comes from config (it is code). No setting/table = static config, zero breaking changes.
  - **Admin console**: new `/admin/settings` page with the bot-protection card (toggle + action checkboxes, disabled state when `verify` is not configured, schema hint when the table is absent). Audit event `settings.updated`.
  - **Admin REST API**: `GET/PUT/DELETE /api/authkit/v1/settings[/:key]` (404 when capability absent).
  - **SDK**: `authkit.settings.list()/get()/set()/delete()` in both remote and embedded drivers.
  - **Doctor**: `checkSettings` warns about an orphan `bot_protection` setting when `botProtection.verify` is absent from config.

## 0.9.0

### Minor Changes

- Round 7 — production pack + multi-tenancy:
  - **Organizations (multi-tenancy)**: optional capability-probed tables (`auth_organizations`, `auth_organization_members`, `auth_organization_invitations`), per-org roles (owner/admin/member), email invitations with hashed tokens, active-org session cookie with `org_id`/`org_slug`/`org_role` claims in id_token/userinfo/JWT access tokens, `/account/orgs` page, admin console section, Admin REST API (`/api/authkit/v1/organizations`), SDK `organizations.*` namespace (remote + embedded), React `useOrganizations`/`useOrganization`/`useSwitchOrganization`/`useOrgInvitations` hooks plus `<OrganizationSwitcher />` and `<OrganizationProfile />` components.
  - **LGPD/GDPR compliance**: self-service and admin account deletion with full cascade (sessions, grants, PATs, passkeys, identities, MFA, avatar) and audit anonymization (stable pseudonym), data export endpoint (`GET /account/security/export`), `login.requireVerifiedEmail` gate across password/magic-link/passkey flows, SDK `users.delete()`.
  - **User migration & password hygiene**: transparent lazy password rehash on login, `password.legacyVerifier` hook for foreign hash formats, `authkit:users:import` ace command (JSON/NDJSON, `--dry-run`), configurable `password.policy`, HaveIBeenPwned k-anonymity breach check (fail-safe), React `usePasswordStrength` + `<PasswordStrengthMeter />`.
  - **JWT access tokens (RFC 9068)**: `accessTokens: { format: 'jwt' }` with per-resource overrides, `verifyJwtAccessToken` local validation in the client package, `authkit:keys:rotate` command with grace-period JWKS rotation.
  - **Bot protection**: pluggable vendor-agnostic `botProtection` config (Turnstile/hCaptcha-ready, fail-safe) on login/signup/reset.
  - **New-device login notification**: `notifications.newDeviceEmail` + `mail.onNewDeviceLogin` hook driven by the trusted-device signal.
  - **Console polish**: session context (user-agent/OS/IP/geo via pluggable `resolveGeo`), RFC 8693 impersonation panel (`admin.impersonation`, default off), dashboard with MAU/daily sign-ins, `GET /api/authkit/v1/stats` + SDK `stats()`.

### Patch Changes

- Updated dependencies
  - @adonis-agora/authkit-core@0.3.0

## 0.8.0

### Minor Changes

- 93bfc4f: Admin REST API (/api/authkit/v1) com API keys — base do SDK

## 0.7.0

### Minor Changes

- 40c7737: Avatar upload no console de conta via o `@adonisjs/drive` do app (config `uploads.avatars`). Por padrão usa o disk default do app, diretório `authkit/avatars`, até 5MB; sobreponível por disk/directory/maxSizeMb. Loader lazy e fail-safe: sem o drive instalado/configurado a feature degrada para o input de URL e o input de arquivo é escondido. Aceita jpg/jpeg/png/webp; tipo/tamanho inválidos flasham erro i18n (EN+PT). Audita `profile.updated` com `{ via: 'upload' | 'url' }`.

## 0.6.0

### Minor Changes

- 0c33640: Round 4 — events/webhooks, DPoP client, full e2e harness, polish.

  **server (minor):** add `events` config — observe every audit event in-process (`onEvent`)
  and/or via an HMAC-signed webhook (`x-authkit-signature: sha256=...`, 5s fire-and-forget,
  never throws into the request path). When set, the resolved `audit` sink becomes a fan-out
  (original sink + onEvent + webhook), preserving the admin `list()` query. Also: a full
  interaction e2e harness driving login → consent → token (plus step-up MFA and device-flow
  variants) through the real host controllers, and English `authkit:doctor` messages. Builds on
  the existing consent/account-console, admin user CRUD, profile self-service, trusted-device,
  and passwordless (magic-link / passkey-first) features.

  **client (minor):** add DPoP (RFC 9449) proof generation — `generateDpopKeyPair()` (jose
  ES256, exportable JWK) and `createDpopProof({ key, htm, htu, nonce?, accessToken? })` producing
  a signed `dpop+jwt`, plus `dpopJwkThumbprint()`.

## 0.5.0

### Minor Changes

- 687501c: Built-in UI strings now default to English; pt-BR ships as a built-in locale (`i18n: { locale: 'pt-BR' }`). BREAKING-ish for hosts relying on pt-BR defaults: set the locale explicitly.

## 0.4.0

### Minor Changes

- Console completo + protocolo: sessões/grants ativos com revogação no admin,
  troca de senha/e-mail self-service, alerta de login de IP novo; Device
  Authorization Grant (RFC 8628), DPoP, PAR e step-up acr/MFA; `authkit:doctor`
  e `authkit:rotate-keys` (keystore de JWKS com rotação).
- 1872a30: DX & ops infra:
  - New package `@adonis-agora/authkit-testing` — test helpers for host apps:
    `createTestIdentity`, `mintTestIdToken` + `serveJwks`/`testJwks`/`jwksFromKey`
    (real RS256 tokens validated by a local JWKS), `fakeAuthenticator`, and a
    capability-aware `fakeAccountStore`.
  - `node ace authkit:doctor` — validates host config and prints ✅/⚠️/❌ findings
    (issuer/mountPath, clients, accountStore capabilities, session, shield, ally,
    rate-limit, admin, webauthn, jwks). Non-zero exit on errors.
  - `node ace authkit:rotate-keys` — rotates managed JWKS signing keys via a new
    file-backed keystore (`jwks: { source: 'managed', store }`), keeping the last
    N public keys so pre-rotation tokens still verify.

### Patch Changes

- Updated dependencies [1872a30]
  - @adonis-agora/authkit-core@0.2.0

## 0.3.0

### Minor Changes

- Console admin (B6): CRUD de clients OIDC armazenados no adapter (DB-backed).
  `/admin/clients` agora cria/edita/deleta clients dinâmicos (client_id/secret
  gerados, secret exibido uma única vez, regenerate-secret, redirect/grants/auth
  method editáveis), além de listar os estáticos do config (read-only). Adapter
  ganha `listClients?()` opcional (implementado no database e redis via SCAN; UI
  degrada graciosamente quando não suportado). Cache de clients do oidc-provider
  invalidado a cada escrita. Novos audit events `client.created/updated/deleted`.

## 0.2.0

### Minor Changes

- Refactors do code review (comportamento preservado, contratos mais limpos):

  **server (minor):**

  - `AccountStore` decomposto em interfaces de capacidade (`CoreAccountStore`,
    `MfaCapability`, `WebauthnCapability`, `ProviderIdentityCapability`) com type
    guards (`supportsMfa`/`supportsPasskeys`/`supportsProviderIdentity`). O tipo
    `AccountStore` continua existindo (core & Partial<capacidades>) — compatível.
    `lucidAccountStore` agora OMITE os métodos de capacidades não configuradas em
    vez de lançar em runtime; social login sem provider-identity degrada pro login.
  - Sequência login+lockout centralizada em `attemptPasswordLogin` (era duplicada
    em 2 controllers).
  - `adminGuard` agora retorna 404 quando `admin.enabled: false` (fecha bypass de
    drift entre config e `AuthHostOptions.admin`).
  - `dynamicRegistration.management: true` sem `enabled: true` agora falha no
    resolve do config (RFC 7592 exige 7591).
  - Serialização JSON dos mixins unificada em `jsonColumn()` (semântica por coluna
    preservada).

  **client (minor):**

  - POST ao token endpoint unificado (`exchangeCode`/`refreshTokens`/`exchangeToken`).
  - Introspection + claims→Identity compartilhados entre resolvers; `pat`/`opaque`
    agora também mapeiam `picture→profile.avatarUrl` e `sid→sessionId` (alinhados
    ao `jwt`).

  **react (patch):**

  - Helpers genéricos de roles; warn de dev no `useAuth` quando não há
    `AuthProvider` nem shared prop do Inertia.

## 0.1.1

### Patch Changes

- Corrige os stubs de scaffolding (`node ace configure`):
  - Usa os nomes renomeados dos pacotes (`@adonis-agora/authkit-*`) — antes os
    stubs ainda importavam de `@authkit/*` (inexistente), gerando código quebrado.
  - O model `AuthUser` scaffoldado passa a usar a **conexão default da aplicação**
    (config/database.ts) por padrão, em vez de forçar `static connection = 'auth'`.
    Para isolar o AuthKit num schema/banco dedicado, basta definir a conexão no
    model — documentado no próprio stub. A lib cria as tabelas no banco do app, ou
    onde o dev definir.
