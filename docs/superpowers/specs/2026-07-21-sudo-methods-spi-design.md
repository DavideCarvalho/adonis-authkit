# SPI de métodos de sudo — design

**Data:** 2026-07-21
**Pacote:** `@adonis-agora/authkit-server`
**Status:** aprovado para planejamento

## Problema

Hosts passwordless ficam **permanentemente presos** fora de todas as operações
sensíveis da área de conta. Não é degradação: é deadlock, sem saída pela UI.

O sudo mode (`src/host/sudo_mode.ts`) exige prova de identidade recente para:

| operação | onde |
|---|---|
| excluir a conta | `account_security_controller.ts:196` |
| exportar dados (LGPD) | `account_security_controller.ts:372` |
| trocar e-mail | `account_security_controller.ts:501` |
| cadastrar / remover passkey | `account_mfa_controller.ts:71,117` |
| ativar / desativar TOTP | `account_mfa_controller.ts:146,216` |
| criar / revogar PAT | `account_tokens_controller.ts:39,62` |

Só existem hoje duas formas de provar identidade (`account_confirm_controller.ts`):
senha e passkey. Num host passwordless o usuário não tem senha, e **cadastrar
passkey também exige sudo** (`account_mfa_controller.ts:71`). O ciclo se fecha:

```
exportar/excluir  → precisa de sudo
cadastrar passkey → precisa de sudo
obter sudo        → precisa de senha OU passkey
usuário tem       → nenhum dos dois
```

O único ponto que concedia sudo sem pré-requisito era o login por senha do
console (`account_session_controller.ts:7` importa `markSudo`). Hosts que
autenticam por OIDC nunca passam por ali: a sessão abre o console para
**leitura** (mesma chave `account_user_id`), mas nunca marca sudo. Leitura
funciona, escrita não.

`SUDO_MODE_DEFAULTS = { enabled: true, graceMinutes: 15 }` e `requireSudo` cai
nesses defaults quando o host não tem `SettingsCapability`. Ou seja: o deadlock
é o comportamento **padrão** para host passwordless, não um caso de borda.

Verificado em produção no `meuprontuario` (host OIDC + signup passwordless):
`/account/security`, `/account/mfa` e `/account/apps` retornam 200; qualquer
POST redireciona para `/account/confirm`, que exibe formulário de senha que o
usuário não tem como preencher.

### Estado morto na própria tela

`views/account/confirm.edge:17` já reconhece o beco sem saída e não tem o que
fazer com ele:

```edge
@if(passwordless && !passkeyAvailable)
  <div class="...amber...">{{ t('account.confirm.passwordless_notice') }}</div>
@else
```

O ramo renderiza um aviso e **nenhum caminho de ação**.

### Bug adjacente

`AccountConfirmController.isPasswordless` (linhas 157-170) diverge do próprio
docblock (36-41). O comentário descreve uma heurística com passkeys; o código só
checa se o hash está vazio, via o escape hatch `accountStore.__getRawRow?.()`.
A função deixa de existir neste design: a pergunta "esta conta pode usar senha?"
passa a ser `password.isAvailable()`.

## Objetivos

1. Nenhuma conta pode ficar sem ao menos um caminho de confirmação de identidade.
2. Métodos de confirmação viram **extensíveis** — o host escolhe quais habilitar,
   e pode escrever os seus.
3. `markSudo` deixa de ser chamado em N lugares e passa a ter um único ponto de
   concessão, auditado.
4. Back-compat total: host que não configurar nada mantém o comportamento atual.

## Não-objetivos

- Telas React tematizadas do console (Projeto 2, spec separado).
- Config de montagem por tela (`AuthHostOptions.account`) — Projeto 2.
- Corrigir o 500 de `/account/tokens` (`cfg.patStore!`) — Projeto 2.
- Tornar a coluna `password` nullable no host para eliminar o hash aleatório
  inutilizável (ver `sudoMethods.password()`) — Projeto 2, do lado do app.
- Métodos `totp` e `sms`. O contrato tem que comportá-los; a implementação não
  entra agora. `totp` em particular só é útil depois que alguém consiga cadastrar
  2FA, o que hoje o próprio deadlock impede.

## Arquitetura

### O contrato

Métodos não compartilham formato de interação, e é isso que define o contrato.
`password` e `passkey` verificam no mesmo request. `magicLink` sai por e-mail e
volta por GET. `oidcStepUp` sai da aplicação inteira e volta pelo callback do
host. Um contrato do tipo `verify(ctx): boolean` não comporta os dois últimos —
por isso o contrato é baseado em **rotas próprias**.

```ts
/** Contexto entregue a todo método. */
export interface SudoContext {
  ctx: HttpContext
  /** Conta logada no console (nunca null: o accountGuard já rodou). */
  account: AuthAccount
  accountId: string
  /** Config resolvida do authkit (accountStore, messages, audit, mail...). */
  cfg: ResolvedAuthkitConfig
  /** Destino pós-confirmação, já validado (só caminhos internos). */
  returnTo: string | null
}

/** Como a tela deve renderizar o passo deste método. */
export interface SudoMethodDescriptor {
  /** Chave i18n do rótulo (ex.: 'account.confirm.method.magic_link'). */
  labelKey: string
  /**
   * 'form'     — a tela renderiza campos e dá POST em `endpoint`.
   * 'action'   — a tela dá POST em `endpoint` sem input (ex.: "enviar link").
   * 'redirect' — a tela manda o usuário para `endpoint` (fluxo externo).
   */
  kind: 'form' | 'action' | 'redirect'
  /** Para onde a tela envia. Absoluto ou relativo à raiz. */
  endpoint: string
  /** Campos a renderizar quando kind === 'form'. */
  fields?: Array<{ name: string; type: 'password' | 'text'; labelKey: string }>
}

export interface SudoMethod {
  /** Estável. Vai no audit (`metadata.method`) e na preferência lembrada. */
  readonly id: string

  /** Disponível para ESTA conta? Ex.: passkey só se houver passkey cadastrada. */
  isAvailable(c: SudoContext): Promise<boolean>

  /** O que a tela mostra para este método. */
  describe(c: SudoContext): Promise<SudoMethodDescriptor>

  /**
   * Endpoints próprios do método, montados sob `/account/confirm/<id>`.
   * Opcional: métodos puramente 'redirect' (oidcStepUp) não registram nada.
   */
  register?(router: Router, h: SudoRouteHelpers): void
}
```

### O runtime

`SudoRouteHelpers.completeSudo(c: SudoContext)` é o **único** lugar do pacote que
chama `markSudo`. Ele faz, nesta ordem: `markSudo(ctx)` → `cfg.audit?.record({
type: 'sudo.confirmed', accountId, ip, metadata: { method: id } })` → redirect
para `c.returnTo ?? accountHome(cfg)`.

Nenhum método chama `markSudo` diretamente. Essa é a regra central do design:
`markSudo` é a concessão de privilégio, e espalhá-la por N métodos multiplica por
N as chances de alguém conceder sem verificar. Um `SudoMethod` só decide
*se* verificou; *conceder* é do runtime.

`completeSudo` também passa a ser **exportado publicamente**, porque o host
precisa dele (ver `oidcStepUp`). Hoje só `markSudo` é público
(`packages/authkit-server/index.ts:352`), o que deixaria o host concedendo sudo
sem registrar auditoria.

`h.fail(c, messageKey)` centraliza o outro lado: `session.flash('confirmError',
translate(...))` + redirect para `/account/confirm` preservando `return_to`. Hoje
essa coreografia está duplicada **cinco vezes** literalmente igual no
`account_confirm_controller`.

### Resolução de métodos

`AccountConfirmController.show` passa a:

1. Resolver a lista configurada (`cfg.sudo.methods`, default
   `[password(), passkey()]`).
2. Filtrar por `isAvailable(c)`, em paralelo.
3. Chamar `describe(c)` nos disponíveis.
4. Renderizar `account/confirm` com `{ methods: SudoMethodDescriptor[],
   preferredId, csrfToken, returnTo, error, messages }`.

Se a lista filtrada for **vazia**, isso é erro de configuração do host, não
usuário preso: loga em `error` e renderiza a tela com uma mensagem explícita.
O estado `passwordless && !passkeyAvailable` deixa de ser representável — ou há
método disponível, ou é bug do host, detectável.

`preferredId` é o último método usado com sucesso, guardado na sessão
(`authkit_sudo_last_method`). É só ordenação da lista — não restringe nada, e
some quando a sessão some. É o "a pessoa pode mudar se quiser" sem virar mais uma
configuração para o usuário administrar.

## Métodos embutidos

### `sudoMethods.password()`

Migração do comportamento atual. `kind: 'form'`, um campo `password`.

`register` monta **`POST /account/confirm`** — a URL histórica, não
`/account/confirm/password`. `confirm.edge:21` posta no path literal, e vale aqui
a mesma razão que preserva as URLs de passkey. É também por isso que `register`
recebe o router cru em vez de o runtime montar por convenção a partir do `id`:
convenção não comporta as URLs legadas.

`isAvailable` = a conta tem hash de senha, via o `__getRawRow` de hoje (agora com
um lar coerente).

**Interação conhecida — hash inutilizável.** Este predicado responde "tem hash?",
não "o usuário conhece a senha?". Um host que cria contas passwordless gravando
um hash aleatório para satisfazer uma coluna `NOT NULL` — o caso do
`meuprontuario`, `app/auth/magic_link_account_store.ts:41`, `randomBytes(24)` —
faz `isAvailable` retornar `true` e a tela oferece um campo de senha que ninguém
consegue preencher.

Não é bloqueante (o deadlock morre de qualquer forma, porque `oidcStepUp` está
sempre disponível), mas é uma opção morta na tela. Não pode ser resolvido dentro
do pacote: do lado de cá, hash aleatório e hash real são indistinguíveis. A
correção é do host, e fica registrada como item do Projeto 2 — gravar `null` no
lugar do hash aleatório, o que exige a coluna `password` ser nullable. Enquanto
isso, o host pode simplesmente omitir `password()` da lista de `methods`, e a
config nova torna isso trivial.

### `sudoMethods.passkey()`

Migração do comportamento atual. `isAvailable` = `supportsPasskeys(store) &&
listPasskeys(accountId).length > 0`. `kind: 'action'`. `register` monta
`POST /account/confirm/passkey/options` e `POST /account/confirm/passkey`,
preservando o challenge em sessão (`authkit_confirm_passkey_challenge`) exatamente
como hoje.

**As URLs atuais (`/account/confirm/passkey`, `/account/confirm/passkey/options`)
são preservadas**, porque há JS na `confirm.edge` que as chama por path literal
(linhas 41-59). Mudar o path quebraria o host que ainda usa o template Edge.

### `sudoMethods.oidcStepUp({ url })`

`isAvailable` → sempre `true`. É o fallback universal: é o único método que não
exige nada previamente cadastrado, e por isso é o que quebra o deadlock.

`kind: 'redirect'`, `endpoint` = `${url}?return_to=<returnTo>`. **Não registra
rotas**: o fluxo sai do pacote. Quem chama `completeSudo` é o host, no seu
callback OIDC, após validar o grant.

Fluxo do lado do host (documentado, não implementado aqui — é Projeto 2):

```
POST /account/security/export
  requireSudo() → sem marca → redirect para o endpoint do método
GET  /auth/step-up
  grava flag de step-up na sessão; inicia Authorization Code + PKCE
  com prompt=login
GET  /auth/callback
  valida state/PKCE/nonce; vê a flag; chama completeSudo(); limpa a flag
```

Duas regras que o spec impõe à documentação deste método, porque é onde fluxos
assim vazam:

- A flag de step-up vive **na sessão**, nunca na querystring. Se trafegasse pela
  URL, qualquer um forjaria um callback que concede sudo.
- `completeSudo` só depois da validação completa do grant. É o `prompt=login`
  que garante que o provider forçou reautenticação em vez de reaproveitar a
  sessão existente.

### `sudoMethods.magicLink()`

`isAvailable` = a conta tem e-mail **e** o host tem envio configurado
(`cfg.mail?.onSudoLink` ou o mailer default). `kind: 'action'`.

`register` monta:

- `POST /account/confirm/magic-link` — gera token, guarda **na sessão**, envia
  e-mail, re-renderiza a tela em estado "link enviado".
- `GET /account/confirm/magic-link/:token` — valida contra a sessão e chama
  `completeSudo`.

**O token de sudo é próprio, nunca o de login.** `issueMagicLinkToken` emite
credencial de *autenticação*: reusá-la faria de um link de sudo vazado uma sessão
completa. O token de sudo é:

| propriedade | valor | razão |
|---|---|---|
| geração | `randomBytes(32)` hex | entropia de credencial |
| armazenamento | **hash** na sessão que pediu | não guarda o segredo em claro |
| escopo | só marca sudo | nunca autentica |
| validade | 5 min | mesma janela dos magic links de login |
| uso | único (apagado no consumo) | replay |
| navegador | só o mesmo (vive na sessão) | step-up é reprova de *quem está ali* |

Guardar na sessão evita storage novo e capability nova, e o "só mesmo navegador"
é propriedade desejada aqui — diferente do magic link de login, onde é limitação
conhecida.

## Config

```ts
defineConfig({
  sudo: {
    methods: [
      sudoMethods.oidcStepUp({ url: '/auth/step-up' }),
      sudoMethods.magicLink(),
      sudoMethods.passkey(),
      sudoMethods.password(),
    ],
  },
})
```

Ausente → `[password(), passkey()]`, idêntico ao comportamento atual. A ordem do
array é a ordem de exibição; `preferredId` promove o último usado ao topo.

`sudo.enabled` / `graceMinutes` continuam onde estão (`SettingsCapability`,
runtime). Este spec não mexe neles.

## Contrato da tela

`account/confirm` muda de props. Antes: `{ csrfToken, returnTo, error,
passwordless, passkeyAvailable }`. Depois: `{ csrfToken, returnTo, error,
methods, preferredId, messages }`.

Isso é **breaking** para host com tela `account/confirm` custom em React. Mitigação:
minor version + nota no CHANGELOG. O template Edge embutido é atualizado junto,
então host que usa o default não percebe.

Chaves i18n novas: `account.confirm.method.password`, `.passkey`,
`.magic_link`, `.oidc_step_up`, `account.confirm.magic_link_sent`,
`account.confirm.no_methods`. Adicionadas em pt-BR e en (`src/host/i18n.ts`).

## Erros

| situação | resposta |
|---|---|
| token de magic link inválido/expirado | `fail()` → flash + volta pro confirm |
| método desconhecido no POST | 404 |
| lista de métodos disponíveis vazia | tela com `no_methods`, log em `error` |
| `isAvailable` lança | método é omitido da lista; log em `warn` |
| falha no envio do e-mail | `fail()`, sem vazar se a conta existe |

`isAvailable` que lança **não** derruba a tela: um método quebrado não pode
trancar o usuário fora dos outros. Isso é deliberado e é o mesmo espírito do
`FAIL-SAFE` já presente em `requireSudo`.

## Testes

Cada método embutido: `isAvailable` verdadeiro e falso; `describe`; sucesso e
falha de verificação.

Runtime: `completeSudo` marca sudo, audita com o `method` certo e redireciona pro
`returnTo` validado; `fail` preserva `return_to`; lista vazia; ordenação por
`preferredId`; `isAvailable` que lança é omitido.

`magicLink`, específicos: token não serve duas vezes; token expirado é rejeitado;
token de outra sessão é rejeitado; **token de login não é aceito como token de
sudo** (é a regressão que protege a decisão mais importante deste spec).

Regressão: **os testes atuais de `account/confirm` devem passar sem alteração.**
Este é refactor de código que verifica identidade; um teste que precise mudar
indica mudança de comportamento, e tem que ser justificada explicitamente, não
acomodada.

## Riscos

**É código de autenticação.** A migração de `password`/`passkey` mexe em caminho
que hoje funciona. Mitigação: URLs preservadas, testes existentes intocados como
critério de aceite, e um único ponto de concessão (`completeSudo`) — que é
menos superfície de erro do que os dois pontos de hoje.

**`oidcStepUp` depende do host implementar o callback direito.** O pacote não tem
como forçar. Mitigação: a documentação do método traz o fluxo completo e as duas
regras de segurança explícitas; `completeSudo` exportado evita que o host
improvise com `markSudo` e perca a auditoria.
