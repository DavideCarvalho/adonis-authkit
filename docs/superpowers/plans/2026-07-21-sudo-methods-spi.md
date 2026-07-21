# SPI de métodos de sudo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar os métodos de confirmação de identidade (sudo mode) extensíveis, com um ponto único de concessão, e quebrar o deadlock que hoje prende hosts passwordless fora de toda operação sensível da área de conta.

**Architecture:** Um SPI (`SudoMethod`) onde cada método declara disponibilidade, como se descreve para a tela, e registra suas próprias rotas. O runtime expõe `completeSudo` — o **único** lugar do pacote que chama `markSudo` — e `fail`, que centraliza a coreografia de erro hoje duplicada cinco vezes. `password` e `passkey` são migrados para o SPI preservando suas URLs; `oidcStepUp` e `magicLink` entram como novos.

**Tech Stack:** TypeScript ESM, AdonisJS 7 (`HttpContext`, `Router`, sessão), Edge para o template embutido, **Japa** (`@japa/runner` + `@japa/assert`) para testes.

## Global Constraints

- Runner é **Japa**, não vitest. Testes em `packages/authkit-server/tests/**/*.spec.ts`, `import { test } from '@japa/runner'`, asserts via `({ assert })`.
- Comando de teste: `cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts`.
- **URLs legadas são intocáveis:** `POST /account/confirm` (senha), `POST /account/confirm/passkey`, `POST /account/confirm/passkey/options`. `src/host/views/account/confirm.edge` chama esses paths literalmente (linhas 21, 41, 52).
- **Nenhum `SudoMethod` chama `markSudo`.** Só `completeSudo` chama. É a regra central do design.
- O token de magic link de sudo **nunca** é o token de login (`issueMagicLinkToken`). Token próprio, `randomBytes(32)`, hash na sessão, single-use, 5 min.
- Chave de sessão do sudo permanece `authkit_sudo_at` (`SUDO_SESSION_KEY`); a do challenge de passkey permanece `authkit_confirm_passkey_challenge`.
- Config ausente → `[password(), passkey()]`, comportamento idêntico ao atual (back-compat).
- Textos de UI em pt-BR e en, em `src/host/i18n.ts` (os dois catálogos).
- Comentários e mensagens de commit em português, seguindo o repo.

## Nota de risco — leia antes da Task 1

O spec assumia que existiam testes de `account/confirm` como critério de aceite. **Não existem.** `grep -rn "AccountConfirmController" packages/authkit-server/tests/` não retorna nada; `tests/host/sudo_mode.spec.ts` cobre o módulo `sudo_mode` (17 testes), não o controller. A menção a `confirm` em `tests/e2e/full_flow.spec.ts:581` é da interaction OIDC, não do sudo mode.

Ou seja: as Tasks 3 e 4 refatoram **código de autenticação sem cobertura**. Por isso a Task 1 existe e vem primeiro — ela constrói a rede de proteção antes de qualquer mudança de comportamento. Não pule, não reordene.

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/host/sudo/types.ts` (novo) | `SudoContext`, `SudoMethodDescriptor`, `SudoMethod`, `SudoRouteHelpers` |
| `src/host/sudo/runtime.ts` (novo) | `completeSudo`, `fail`, `resolveAvailableMethods`, `LAST_METHOD_SESSION_KEY` |
| `src/host/sudo/methods/password.ts` (novo) | `sudoMethods.password()` |
| `src/host/sudo/methods/passkey.ts` (novo) | `sudoMethods.passkey()` |
| `src/host/sudo/methods/oidc_step_up.ts` (novo) | `sudoMethods.oidcStepUp({ url })` |
| `src/host/sudo/methods/magic_link.ts` (novo) | `sudoMethods.magicLink()` |
| `src/host/sudo/index.ts` (novo) | barrel `sudoMethods` |
| `src/host/controllers/account_confirm_controller.ts` | reescrito sobre o SPI; perde `isPasswordless` |
| `src/host/register_auth_host.ts:377-380` | passa a montar as rotas dos métodos |
| `src/host/views/account/confirm.edge` | renderiza lista de métodos |
| `src/host/i18n.ts` | chaves novas (pt-BR + en) |
| `src/define_config.ts` | `sudo?: { methods?: SudoMethod[] }` |
| `index.ts` | exporta `sudoMethods`, `completeSudo`, tipos |

`src/host/sudo_mode.ts` (grace/settings/`markSudo`) **não muda**. É outro assunto: ele decide *se* precisa de sudo; o SPI decide *como* se prova.

---

### Task 1: Rede de proteção — caracterizar o controller atual

Pina o comportamento de hoje **sem alterar nada de produção**. Estes testes têm que continuar verdes até o fim do plano; se algum precisar mudar depois, é mudança de comportamento e exige justificativa explícita no PR.

**Files:**
- Test: `packages/authkit-server/tests/host/account_confirm_controller.spec.ts` (criar)

**Interfaces:**
- Consumes: `AccountConfirmController` de `src/host/controllers/account_confirm_controller.js`; `SUDO_SESSION_KEY` de `src/host/sudo_mode.js`; `ACCOUNT_SESSION_KEY` de `src/host/middleware/account_auth.js`.
- Produces: o helper `fakeConfirmCtx(...)`, reusado nas Tasks 4, 6 e 7.

- [ ] **Step 1: Escrever os testes de caracterização**

Crie `packages/authkit-server/tests/host/account_confirm_controller.spec.ts`:

```ts
import { test } from '@japa/runner'
import AccountConfirmController from '../../src/host/controllers/account_confirm_controller.js'
import { SUDO_SESSION_KEY } from '../../src/host/sudo_mode.js'
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js'
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js'

const ACCOUNT = { id: 'acc-1', email: 'user@example.com' }

/**
 * Contexto HTTP mínimo para o controller. Captura o que foi renderizado,
 * redirecionado e flashado, para os testes assertarem sobre isso.
 */
function fakeConfirmCtx(opts: {
  input?: Record<string, unknown>
  qs?: Record<string, unknown>
  session?: Record<string, unknown>
  cfg?: Record<string, unknown>
} = {}) {
  const session: Record<string, unknown> = { [ACCOUNT_SESSION_KEY]: ACCOUNT.id, ...opts.session }
  const flashed: Record<string, unknown> = {}
  const rendered: Array<{ view: string; props: Record<string, unknown> }> = []
  const redirects: string[] = []

  const cfg = {
    messages: { ...DEFAULT_MESSAGES },
    render: async (_c: unknown, view: string, props: Record<string, unknown>) => {
      rendered.push({ view, props })
      return { _rendered: view }
    },
    accountStore: {
      async findById(id: string) { return id === ACCOUNT.id ? ACCOUNT : null },
      async verifyCredentials(_email: string, password: string) { return password === 'correta' },
      async __getRawRow(_id: string) { return { password: 'hash-existente' } },
    },
    audit: { records: [] as unknown[], async record(e: unknown) { (cfg.audit.records as unknown[]).push(e) } },
    ...opts.cfg,
  } as any

  const ctx = {
    session: {
      get: (k: string) => session[k],
      put: (k: string, v: unknown) => { session[k] = v },
      forget: (k: string) => { delete session[k] },
      flash: (k: string, v: unknown) => { flashed[k] = v },
      flashMessages: { get: (k: string) => flashed[k] ?? null },
      _data: session,
    },
    request: {
      csrfToken: 'csrf-token',
      only: (keys: string[]) => Object.fromEntries(keys.map((k) => [k, opts.input?.[k]])),
      input: (k: string) => opts.input?.[k],
      qs: () => opts.qs ?? {},
      ip: () => '203.0.113.1',
    },
    response: {
      redirect: (url: string) => { redirects.push(url); return { _redirect: url } },
      notFound: (body: unknown) => ({ _notFound: body }),
    },
    containerResolver: { make: async (_k: string) => ({ config: cfg }) },
  } as any

  return { ctx, cfg, session, flashed, rendered, redirects }
}

test.group('AccountConfirmController — comportamento atual (caracterização)', () => {
  test('show renderiza account/confirm com csrfToken, returnTo e flags', async ({ assert }) => {
    const h = fakeConfirmCtx({ qs: { return_to: '/account/security' } })
    await new AccountConfirmController().show(h.ctx)

    assert.lengthOf(h.rendered, 1)
    assert.equal(h.rendered[0].view, 'account/confirm')
    assert.equal(h.rendered[0].props.csrfToken, 'csrf-token')
    assert.equal(h.rendered[0].props.returnTo, '/account/security')
    assert.isFalse(h.rendered[0].props.passwordless as boolean)
  })

  test('show rejeita return_to externo (open-redirect)', async ({ assert }) => {
    const h = fakeConfirmCtx({ qs: { return_to: 'https://evil.com' } })
    await new AccountConfirmController().show(h.ctx)
    assert.isNull(h.rendered[0].props.returnTo)
  })

  test('confirm com senha correta marca sudo e redireciona pro returnTo', async ({ assert }) => {
    const h = fakeConfirmCtx({ input: { password: 'correta', return_to: '/account/security' } })
    await new AccountConfirmController().confirm(h.ctx)

    assert.isNumber(h.session[SUDO_SESSION_KEY])
    assert.deepEqual(h.redirects, ['/account/security'])
  })

  test('confirm com senha correta audita com method=password', async ({ assert }) => {
    const h = fakeConfirmCtx({ input: { password: 'correta' } })
    await new AccountConfirmController().confirm(h.ctx)

    assert.lengthOf(h.cfg.audit.records, 1)
    assert.deepInclude(h.cfg.audit.records[0], { type: 'sudo.confirmed', accountId: ACCOUNT.id })
    assert.deepEqual((h.cfg.audit.records[0] as any).metadata, { method: 'password' })
  })

  test('confirm com senha errada NÃO marca sudo, flasha erro e volta pro confirm', async ({ assert }) => {
    const h = fakeConfirmCtx({ input: { password: 'errada', return_to: '/account/security' } })
    await new AccountConfirmController().confirm(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.isNotNull(h.flashed.confirmError)
    assert.deepEqual(h.redirects, ['/account/confirm?return_to=%2Faccount%2Fsecurity'])
  })

  test('confirm sem senha NÃO marca sudo', async ({ assert }) => {
    const h = fakeConfirmCtx({ input: {} })
    await new AccountConfirmController().confirm(h.ctx)
    assert.isUndefined(h.session[SUDO_SESSION_KEY])
  })

  test('passkeyConfirm sem challenge na sessão NÃO marca sudo', async ({ assert }) => {
    const h = fakeConfirmCtx({ input: { response: '{}' } })
    await new AccountConfirmController().passkeyConfirm(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.isNotNull(h.flashed.confirmError)
  })

  test('passkeyConfirm válido marca sudo e audita com method=passkey', async ({ assert }) => {
    const h = fakeConfirmCtx({
      input: { response: JSON.stringify({ id: 'cred' }) },
      session: { authkit_confirm_passkey_challenge: 'chal-1' },
      cfg: {
        accountStore: {
          async findById() { return ACCOUNT },
          async verifyPasskeyAuthentication() { return true },
        },
      },
    })
    await new AccountConfirmController().passkeyConfirm(h.ctx)

    assert.isNumber(h.session[SUDO_SESSION_KEY])
    assert.deepEqual((h.cfg.audit.records[0] as any).metadata, { method: 'passkey' })
  })

  test('passkeyConfirm inválido NÃO marca sudo e limpa o challenge', async ({ assert }) => {
    const h = fakeConfirmCtx({
      input: { response: JSON.stringify({ id: 'cred' }) },
      session: { authkit_confirm_passkey_challenge: 'chal-1' },
      cfg: {
        accountStore: {
          async findById() { return ACCOUNT },
          async verifyPasskeyAuthentication() { return false },
        },
      },
    })
    await new AccountConfirmController().passkeyConfirm(h.ctx)

    assert.isUndefined(h.session[SUDO_SESSION_KEY])
    assert.isUndefined(h.session.authkit_confirm_passkey_challenge)
  })
})
```

- [ ] **Step 2: Rodar e verificar que passam contra o código ATUAL**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/account_confirm_controller.spec.ts
```

Esperado: **9 passed**. Se algum falhar, o teste está errado (o código de produção não mudou) — corrija o teste, não o código.

- [ ] **Step 3: Commit**

```bash
git add packages/authkit-server/tests/host/account_confirm_controller.spec.ts
git commit -m "test: caracteriza o AccountConfirmController antes do refactor de sudo

O controller não tinha NENHUM teste — sudo_mode.spec.ts cobre o módulo, não
o controller. Como as próximas tasks migram password/passkey para o SPI,
estes testes são a rede de proteção: pinam senha certa/errada, ausência de
senha, passkey com e sem challenge, o audit metadata.method e a rejeição de
return_to externo."
```

---

### Task 2: Contrato e runtime do SPI

Módulos puros, sem tocar no controller ainda.

**Files:**
- Create: `packages/authkit-server/src/host/sudo/types.ts`
- Create: `packages/authkit-server/src/host/sudo/runtime.ts`
- Test: `packages/authkit-server/tests/host/sudo_runtime.spec.ts`

**Interfaces:**
- Consumes: `markSudo`, `SUDO_SESSION_KEY` de `src/host/sudo_mode.js`; `validateReturnTo` de `src/host/controllers/account_session_controller.js`; `translate` de `src/host/i18n.js`; `accountHome` de `src/host/account_home.js`.
- Produces: `SudoContext`, `SudoMethodDescriptor`, `SudoMethod`, `SudoRouteHelpers`, `completeSudo(c)`, `fail(c, messageKey)`, `resolveAvailableMethods(c, methods)`, `LAST_METHOD_SESSION_KEY`.

- [ ] **Step 1: Escrever os testes**

Crie `packages/authkit-server/tests/host/sudo_runtime.spec.ts`:

```ts
import { test } from '@japa/runner'
import { completeSudo, fail, resolveAvailableMethods, LAST_METHOD_SESSION_KEY } from '../../src/host/sudo/runtime.js'
import { SUDO_SESSION_KEY } from '../../src/host/sudo_mode.js'
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js'
import type { SudoMethod } from '../../src/host/sudo/types.js'

function fakeSudoContext(opts: { returnTo?: string | null } = {}) {
  const session: Record<string, unknown> = {}
  const flashed: Record<string, unknown> = {}
  const redirects: string[] = []
  const audit: unknown[] = []

  const c = {
    accountId: 'acc-1',
    account: { id: 'acc-1', email: 'user@example.com' },
    returnTo: opts.returnTo ?? null,
    cfg: {
      messages: { ...DEFAULT_MESSAGES },
      audit: { async record(e: unknown) { audit.push(e) } },
    },
    ctx: {
      session: {
        get: (k: string) => session[k],
        put: (k: string, v: unknown) => { session[k] = v },
        forget: (k: string) => { delete session[k] },
        flash: (k: string, v: unknown) => { flashed[k] = v },
      },
      request: { ip: () => '203.0.113.1' },
      response: { redirect: (u: string) => { redirects.push(u); return { _redirect: u } } },
    },
  } as any

  return { c, session, flashed, redirects, audit }
}

/** Método de teste com disponibilidade e id controláveis. */
function stubMethod(id: string, available: boolean | (() => never)): SudoMethod {
  return {
    id,
    async isAvailable() {
      if (typeof available === 'function') available()
      return available as boolean
    },
    async describe() {
      return { labelKey: `account.confirm.method.${id}`, kind: 'action', endpoint: `/account/confirm/${id}` }
    },
  }
}

test.group('completeSudo', () => {
  test('marca sudo na sessão', async ({ assert }) => {
    const h = fakeSudoContext()
    await completeSudo(h.c, 'password')
    assert.isNumber(h.session[SUDO_SESSION_KEY])
  })

  test('audita com o method recebido', async ({ assert }) => {
    const h = fakeSudoContext()
    await completeSudo(h.c, 'magic-link')
    assert.deepInclude(h.audit[0] as object, { type: 'sudo.confirmed', accountId: 'acc-1' })
    assert.deepEqual((h.audit[0] as any).metadata, { method: 'magic-link' })
  })

  test('lembra o método usado para ordenar a tela depois', async ({ assert }) => {
    const h = fakeSudoContext()
    await completeSudo(h.c, 'passkey')
    assert.equal(h.session[LAST_METHOD_SESSION_KEY], 'passkey')
  })

  test('redireciona pro returnTo quando presente', async ({ assert }) => {
    const h = fakeSudoContext({ returnTo: '/account/security' })
    await completeSudo(h.c, 'password')
    assert.deepEqual(h.redirects, ['/account/security'])
  })

  test('redireciona pro accountHome quando não há returnTo', async ({ assert }) => {
    const h = fakeSudoContext()
    await completeSudo(h.c, 'password')
    assert.deepEqual(h.redirects, ['/account/security'])
  })
})

test.group('fail', () => {
  test('flasha o erro traduzido e NÃO marca sudo', async ({ assert }) => {
    const h = fakeSudoContext()
    await fail(h.c, 'account.confirm.error')
    assert.isNotNull(h.flashed.confirmError)
    assert.isUndefined(h.session[SUDO_SESSION_KEY])
  })

  test('preserva o return_to no redirect de volta', async ({ assert }) => {
    const h = fakeSudoContext({ returnTo: '/account/security' })
    await fail(h.c, 'account.confirm.error')
    assert.deepEqual(h.redirects, ['/account/confirm?return_to=%2Faccount%2Fsecurity'])
  })
})

test.group('resolveAvailableMethods', () => {
  test('filtra os indisponíveis', async ({ assert }) => {
    const h = fakeSudoContext()
    const out = await resolveAvailableMethods(h.c, [stubMethod('a', true), stubMethod('b', false)])
    assert.deepEqual(out.map((m) => m.id), ['a'])
  })

  test('omite método cujo isAvailable lança, sem derrubar os outros', async ({ assert }) => {
    const h = fakeSudoContext()
    const explode = stubMethod('boom', () => { throw new Error('falhou') })
    const out = await resolveAvailableMethods(h.c, [explode, stubMethod('ok', true)])
    assert.deepEqual(out.map((m) => m.id), ['ok'])
  })

  test('promove o último método usado para o topo', async ({ assert }) => {
    const h = fakeSudoContext()
    h.session[LAST_METHOD_SESSION_KEY] = 'b'
    const out = await resolveAvailableMethods(h.c, [stubMethod('a', true), stubMethod('b', true)])
    assert.deepEqual(out.map((m) => m.id), ['b', 'a'])
  })

  test('devolve lista vazia quando nada está disponível', async ({ assert }) => {
    const h = fakeSudoContext()
    const out = await resolveAvailableMethods(h.c, [stubMethod('a', false)])
    assert.lengthOf(out, 0)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_runtime.spec.ts
```

Esperado: FAIL — `Cannot find module '../../src/host/sudo/runtime.js'`.

- [ ] **Step 3: Criar o contrato**

Crie `packages/authkit-server/src/host/sudo/types.ts`:

```ts
import type { HttpContext } from '@adonisjs/core/http'
import type { Router } from '@adonisjs/core/http'

/** Contexto entregue a todo método de sudo. */
export interface SudoContext {
  ctx: HttpContext
  /** Conta logada no console. Nunca null: o accountGuard já rodou. */
  account: { id: string; email: string | null }
  accountId: string
  /** Config resolvida do authkit (accountStore, messages, audit, mail...). */
  cfg: any
  /** Destino pós-confirmação, já validado — só caminhos internos. */
  returnTo: string | null
}

/** Como a tela deve renderizar o passo deste método. */
export interface SudoMethodDescriptor {
  /** Chave i18n do rótulo. Ex.: 'account.confirm.method.magic_link'. */
  labelKey: string
  /**
   * 'form'     — a tela renderiza `fields` e dá POST em `endpoint`.
   * 'action'   — a tela dá POST em `endpoint` sem input.
   * 'redirect' — a tela manda o usuário para `endpoint` (fluxo externo).
   */
  kind: 'form' | 'action' | 'redirect'
  endpoint: string
  fields?: Array<{ name: string; type: 'password' | 'text'; labelKey: string }>
}

/** Helpers que o runtime entrega às rotas de um método. */
export interface SudoRouteHelpers {
  /** Monta o SudoContext a partir do HttpContext (resolve config, conta, returnTo). */
  contextFrom(ctx: HttpContext): Promise<SudoContext>
  /** ÚNICO ponto de concessão de sudo no pacote. */
  completeSudo(c: SudoContext, methodId: string): Promise<unknown>
  /** Flash de erro + volta pro /account/confirm preservando return_to. */
  fail(c: SudoContext, messageKey: string): Promise<unknown>
}

/**
 * Método de confirmação de identidade (sudo mode).
 *
 * REGRA CENTRAL: um método NUNCA chama `markSudo`. Ele decide apenas SE
 * verificou; conceder é do runtime, via `completeSudo`. `markSudo` é a
 * concessão de privilégio — espalhá-la por N métodos multiplicaria por N as
 * chances de alguém conceder sem ter verificado.
 */
export interface SudoMethod {
  /** Estável. Vai no audit (`metadata.method`) e na preferência lembrada. */
  readonly id: string
  /** Disponível para ESTA conta? Ex.: passkey só se houver passkey cadastrada. */
  isAvailable(c: SudoContext): Promise<boolean>
  /** O que a tela mostra para este método. */
  describe(c: SudoContext): Promise<SudoMethodDescriptor>
  /**
   * Endpoints próprios. Opcional: métodos puramente 'redirect' (oidcStepUp)
   * não registram nada, porque o fluxo sai do pacote.
   *
   * Recebe o router cru (não monta por convenção a partir do `id`) porque
   * `password` e `passkey` precisam manter URLs legadas que uma convenção
   * não comportaria.
   */
  register?(router: Router, h: SudoRouteHelpers): void
}
```

- [ ] **Step 4: Criar o runtime**

Crie `packages/authkit-server/src/host/sudo/runtime.ts`:

```ts
import { markSudo } from '../sudo_mode.js'
import { accountHome } from '../account_home.js'
import { translate } from '../i18n.js'
import type { SudoContext, SudoMethod } from './types.js'

/** Último método usado com sucesso — só ordena a tela, não restringe nada. */
export const LAST_METHOD_SESSION_KEY = 'authkit_sudo_last_method'

/**
 * ÚNICO ponto do pacote que concede sudo. Nenhum `SudoMethod` chama
 * `markSudo` diretamente: o método decide se verificou, o runtime concede,
 * audita e redireciona.
 */
export async function completeSudo(c: SudoContext, methodId: string): Promise<unknown> {
  markSudo(c.ctx)
  c.ctx.session.put(LAST_METHOD_SESSION_KEY, methodId)

  await c.cfg.audit?.record({
    type: 'sudo.confirmed',
    accountId: c.accountId,
    ip: c.ctx.request.ip?.() ?? null,
    metadata: { method: methodId },
  })

  return c.ctx.response.redirect(c.returnTo ?? accountHome(c.cfg))
}

/**
 * Falha de confirmação: flash + volta pro /account/confirm preservando o
 * destino. Substitui a coreografia que estava duplicada cinco vezes no
 * controller.
 */
export async function fail(c: SudoContext, messageKey: string): Promise<unknown> {
  c.ctx.session.flash('confirmError', translate(c.cfg.messages, messageKey))
  const qs = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
  return c.ctx.response.redirect(`/account/confirm${qs}`)
}

/**
 * Filtra os métodos disponíveis para esta conta e promove o último usado.
 *
 * `isAvailable` que lança NÃO derruba a tela: um método quebrado não pode
 * trancar o usuário fora dos outros — mesmo espírito do FAIL-SAFE de
 * `requireSudo`.
 */
export async function resolveAvailableMethods(
  c: SudoContext,
  methods: SudoMethod[]
): Promise<SudoMethod[]> {
  const checked = await Promise.all(
    methods.map(async (m) => {
      try {
        return (await m.isAvailable(c)) ? m : null
      } catch {
        return null
      }
    })
  )

  const available = checked.filter((m): m is SudoMethod => m !== null)
  const last = c.ctx.session.get(LAST_METHOD_SESSION_KEY) as string | undefined
  if (!last) return available

  const preferred = available.filter((m) => m.id === last)
  return preferred.length ? [...preferred, ...available.filter((m) => m.id !== last)] : available
}
```

- [ ] **Step 5: Rodar e verificar que passam**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_runtime.spec.ts
```

Esperado: **13 passed**.

- [ ] **Step 6: Commit**

```bash
git add packages/authkit-server/src/host/sudo packages/authkit-server/tests/host/sudo_runtime.spec.ts
git commit -m "feat(sudo): contrato SudoMethod + runtime com ponto único de concessão

completeSudo é o único lugar do pacote que chama markSudo; nenhum método o
chama direto. fail() centraliza a coreografia de erro que estava duplicada
cinco vezes no account_confirm_controller. resolveAvailableMethods omite
método cujo isAvailable lança, para que um método quebrado não tranque o
usuário fora dos demais."
```

---

### Task 3: `password` e `passkey` como métodos do SPI

Implementa os dois métodos isoladamente. O controller ainda **não** os usa — a troca é a Task 4, para que um review possa rejeitar a migração sem rejeitar os métodos.

**Files:**
- Create: `packages/authkit-server/src/host/sudo/methods/password.ts`
- Create: `packages/authkit-server/src/host/sudo/methods/passkey.ts`
- Test: `packages/authkit-server/tests/host/sudo_methods_builtin.spec.ts`

**Interfaces:**
- Consumes: `SudoMethod`, `SudoContext`, `SudoRouteHelpers` de `../types.js`; `supportsPasskeys` de `src/accounts/account_store.js`.
- Produces: `password(): SudoMethod` (id `'password'`), `passkey(): SudoMethod` (id `'passkey'`), `CONFIRM_PASSKEY_CHALLENGE_KEY`.

- [ ] **Step 1: Escrever os testes**

Crie `packages/authkit-server/tests/host/sudo_methods_builtin.spec.ts`:

```ts
import { test } from '@japa/runner'
import { password } from '../../src/host/sudo/methods/password.js'
import { passkey } from '../../src/host/sudo/methods/passkey.js'

function ctxWith(cfg: Record<string, unknown>) {
  return { accountId: 'acc-1', account: { id: 'acc-1', email: 'u@e.com' }, returnTo: null, cfg, ctx: {} } as any
}

test.group('sudoMethods.password', () => {
  test('disponível quando a conta tem hash de senha', async ({ assert }) => {
    const c = ctxWith({ accountStore: { async __getRawRow() { return { password: 'hash' } } } })
    assert.isTrue(await password().isAvailable(c))
  })

  test('indisponível quando o hash está vazio', async ({ assert }) => {
    const c = ctxWith({ accountStore: { async __getRawRow() { return { password: '' } } } })
    assert.isFalse(await password().isAvailable(c))
  })

  test('indisponível quando o store não expõe __getRawRow', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    assert.isFalse(await password().isAvailable(c))
  })

  test('descreve um form com o campo password', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    const d = await password().describe(c)
    assert.equal(d.kind, 'form')
    assert.equal(d.endpoint, '/account/confirm')
    assert.deepEqual(d.fields?.map((f) => f.name), ['password'])
  })
})

test.group('sudoMethods.passkey', () => {
  test('disponível quando há passkey cadastrada', async ({ assert }) => {
    const c = ctxWith({
      accountStore: {
        listPasskeys: async () => [{ id: 'pk-1' }],
        generatePasskeyAuthenticationOptions: async () => ({}),
        verifyPasskeyAuthentication: async () => true,
      },
    })
    assert.isTrue(await passkey().isAvailable(c))
  })

  test('indisponível quando não há passkey cadastrada', async ({ assert }) => {
    const c = ctxWith({
      accountStore: {
        listPasskeys: async () => [],
        generatePasskeyAuthenticationOptions: async () => ({}),
        verifyPasskeyAuthentication: async () => true,
      },
    })
    assert.isFalse(await passkey().isAvailable(c))
  })

  test('indisponível quando o store não suporta passkeys', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    assert.isFalse(await passkey().isAvailable(c))
  })

  test('descreve uma action na URL legada', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    const d = await passkey().describe(c)
    assert.equal(d.kind, 'action')
    assert.equal(d.endpoint, '/account/confirm/passkey')
  })
})
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_methods_builtin.spec.ts
```

Esperado: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `password`**

Crie `packages/authkit-server/src/host/sudo/methods/password.ts`:

```ts
import type { Router } from '@adonisjs/core/http'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js'

/**
 * Confirmação por senha — o método histórico.
 *
 * URL LEGADA: registra `POST /account/confirm` (não `/account/confirm/password`),
 * porque `src/host/views/account/confirm.edge:21` posta nesse path literal.
 * É também a razão de `register` receber o router cru em vez de o runtime
 * montar por convenção a partir do `id`.
 *
 * LIMITAÇÃO CONHECIDA de `isAvailable`: ele responde "a conta tem hash?", não
 * "o usuário conhece a senha?". Host que cria contas passwordless gravando um
 * hash aleatório para satisfazer uma coluna NOT NULL verá este método como
 * disponível e mostrará um campo que ninguém consegue preencher. De dentro do
 * pacote, hash aleatório e hash real são indistinguíveis; a correção é do host
 * (coluna nullable) ou basta omitir `password()` da lista de `methods`.
 */
export function password(): SudoMethod {
  return {
    id: 'password',

    async isAvailable(c: SudoContext) {
      try {
        const row = await c.cfg.accountStore.__getRawRow?.(c.accountId)
        return Boolean(row?.password)
      } catch {
        return false
      }
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.password',
        kind: 'form' as const,
        endpoint: '/account/confirm',
        fields: [
          { name: 'password', type: 'password' as const, labelKey: 'account.confirm.password_label' },
        ],
      }
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        const { password: submitted } = ctx.request.only(['password'])

        if (!submitted || !c.account) return h.fail(c, 'account.confirm.error')

        const ok = await c.cfg.accountStore.verifyCredentials(c.account.email, submitted)
        if (!ok) return h.fail(c, 'account.confirm.error')

        return h.completeSudo(c, 'password')
      })
    },
  }
}
```

- [ ] **Step 4: Implementar `passkey`**

Crie `packages/authkit-server/src/host/sudo/methods/passkey.ts`:

```ts
import type { Router } from '@adonisjs/core/http'
import { supportsPasskeys } from '../../../accounts/account_store.js'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js'

/** Chave de sessão do challenge — preservada do controller original. */
export const CONFIRM_PASSKEY_CHALLENGE_KEY = 'authkit_confirm_passkey_challenge'

/**
 * Confirmação por passkey (WebAuthn).
 *
 * URLs LEGADAS preservadas: `/account/confirm/passkey/options` e
 * `/account/confirm/passkey`. O JS embutido em `confirm.edge:52,59` chama esses
 * paths literalmente.
 */
export function passkey(): SudoMethod {
  return {
    id: 'passkey',

    async isAvailable(c: SudoContext) {
      if (!supportsPasskeys(c.cfg.accountStore)) return false
      const list = await c.cfg.accountStore.listPasskeys(c.accountId)
      return list.length > 0
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.passkey',
        kind: 'action' as const,
        endpoint: '/account/confirm/passkey',
      }
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm/passkey/options', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        const generated = await c.cfg.accountStore.generatePasskeyAuthenticationOptions?.(c.accountId)
        if (!generated) {
          return ctx.response.notFound({ message: 'no passkey registered' })
        }
        ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_KEY, generated.challenge)
        return generated.options
      })

      router.post('/account/confirm/passkey', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        const challenge = ctx.session.get(CONFIRM_PASSKEY_CHALLENGE_KEY) as string | undefined
        if (!challenge) return h.fail(c, 'account.confirm.passkey_error')

        const raw = ctx.request.input('response') as string | undefined
        let parsed: unknown = null
        try {
          parsed = raw ? JSON.parse(raw) : null
        } catch {
          parsed = null
        }

        const ok = parsed
          ? ((await c.cfg.accountStore.verifyPasskeyAuthentication?.(c.accountId, parsed, challenge)) ?? false)
          : false

        ctx.session.forget(CONFIRM_PASSKEY_CHALLENGE_KEY)
        if (!ok) return h.fail(c, 'account.confirm.passkey_error')

        return h.completeSudo(c, 'passkey')
      })
    },
  }
}
```

- [ ] **Step 5: Rodar e verificar que passam**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_methods_builtin.spec.ts
```

Esperado: **8 passed**.

- [ ] **Step 6: Commit**

```bash
git add packages/authkit-server/src/host/sudo/methods packages/authkit-server/tests/host/sudo_methods_builtin.spec.ts
git commit -m "feat(sudo): password e passkey como métodos do SPI

Ainda não cabeados no controller (Task 4), para que a migração possa ser
revisada separadamente dos métodos. URLs legadas preservadas: password
registra POST /account/confirm e passkey mantém /account/confirm/passkey
[/options], porque confirm.edge chama esses paths literalmente."
```

---

### Task 4: Migrar o controller para o SPI

A task de maior risco. As duas suítes anteriores são o critério: **os 9 testes de caracterização da Task 1 têm que continuar verdes sem edição.**

**Files:**
- Modify: `packages/authkit-server/src/host/controllers/account_confirm_controller.ts` (reescrito)
- Modify: `packages/authkit-server/src/host/register_auth_host.ts:377-380`
- Modify: `packages/authkit-server/src/define_config.ts` (campo `sudo`)
- Test: `packages/authkit-server/tests/host/account_confirm_controller.spec.ts` (só acrescenta; não edita o existente)

**Interfaces:**
- Consumes: `resolveAvailableMethods`, `completeSudo`, `fail` de `../sudo/runtime.js`; `password()`, `passkey()` de `../sudo/methods/*.js`.
- Produces: `SUDO_METHOD_DEFAULTS = [password(), passkey()]`; `AccountConfirmController.show` renderizando `{ csrfToken, returnTo, error, methods, preferredId, messages }`.

- [ ] **Step 1: Acrescentar os testes das props novas**

Adicione ao final de `tests/host/account_confirm_controller.spec.ts` (sem tocar nos grupos existentes):

```ts
test.group('AccountConfirmController — SPI de métodos', () => {
  test('show entrega descritores dos métodos disponíveis', async ({ assert }) => {
    const h = fakeConfirmCtx()
    await new AccountConfirmController().show(h.ctx)

    const methods = h.rendered[0].props.methods as Array<{ id: string }>
    assert.isArray(methods)
    assert.include(methods.map((m) => m.id), 'password')
  })

  test('show omite password quando a conta não tem hash', async ({ assert }) => {
    const h = fakeConfirmCtx({
      cfg: { accountStore: { async findById() { return ACCOUNT }, async __getRawRow() { return { password: '' } } } },
    })
    await new AccountConfirmController().show(h.ctx)

    const methods = h.rendered[0].props.methods as Array<{ id: string }>
    assert.notInclude(methods.map((m) => m.id), 'password')
  })

  test('show sinaliza no_methods quando nada está disponível', async ({ assert }) => {
    const h = fakeConfirmCtx({
      cfg: { accountStore: { async findById() { return ACCOUNT }, async __getRawRow() { return { password: '' } } } },
    })
    await new AccountConfirmController().show(h.ctx)

    assert.lengthOf(h.rendered[0].props.methods as unknown[], 0)
  })
})
```

- [ ] **Step 2: Rodar e verificar que os novos falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/account_confirm_controller.spec.ts
```

Esperado: 9 passed (caracterização) + 3 failed (props `methods` ainda não existem).

- [ ] **Step 3: Adicionar o campo `sudo` ao config**

Em `packages/authkit-server/src/define_config.ts`, ao lado de `audit?: AuditSink;` (linha 920), acrescente:

```ts
  /**
   * Métodos de confirmação de identidade (sudo mode). A ordem do array é a
   * ordem de exibição; o último método usado com sucesso é promovido ao topo.
   *
   * Ausente → `[password(), passkey()]`, idêntico ao comportamento histórico.
   *
   * Host passwordless (autentica por OIDC/magic link) DEVE incluir ao menos um
   * método que não exija credencial previamente cadastrada — `oidcStepUp()` ou
   * `magicLink()` — senão o usuário fica sem caminho para exportar/excluir os
   * próprios dados.
   */
  sudo?: { methods?: SudoMethod[] };
```

Importe o tipo no topo do arquivo:

```ts
import type { SudoMethod } from "./host/sudo/types.js";
```

Replique o campo no shape resolvido (`ResolvedAuthkitConfig`, perto da linha 1116):

```ts
  sudo?: { methods?: SudoMethod[] };
```

- [ ] **Step 4: Reescrever o controller**

Substitua o conteúdo de `packages/authkit-server/src/host/controllers/account_confirm_controller.ts` por:

```ts
/**
 * Sudo mode — tela de confirmação de identidade (/account/confirm).
 *
 * O GET lista os métodos DISPONÍVEIS para a conta (SPI `SudoMethod`); a
 * verificação de cada um vive no próprio método, nas rotas que ele registra.
 * Este controller não verifica credencial nem chama `markSudo`.
 *
 * A tela está atrás do `accountGuard` (requer sessão de conta ativa).
 */

import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { validateReturnTo } from './account_session_controller.js'
import { resolveAvailableMethods, LAST_METHOD_SESSION_KEY } from '../sudo/runtime.js'
import { password } from '../sudo/methods/password.js'
import { passkey } from '../sudo/methods/passkey.js'
import type { SudoContext, SudoMethod } from '../sudo/types.js'

/** Sem config → comportamento histórico. */
export const SUDO_METHOD_DEFAULTS: SudoMethod[] = [password(), passkey()]

export function configuredSudoMethods(cfg: any): SudoMethod[] {
  const configured = cfg?.sudo?.methods
  return Array.isArray(configured) && configured.length ? configured : SUDO_METHOD_DEFAULTS
}

/** Monta o SudoContext a partir do HttpContext. Usado aqui e pelas rotas dos métodos. */
export async function sudoContextFrom(ctx: HttpContext): Promise<SudoContext> {
  const service = await (ctx as any).containerResolver.make('authkit.server')
  const cfg = service.config
  const accountId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
  const account = await cfg.accountStore.findById(accountId)
  const raw = (ctx.request as any).qs?.()?.return_to ?? ctx.request.input?.('return_to')

  return { ctx, cfg, accountId, account, returnTo: validateReturnTo(raw) }
}

export default class AccountConfirmController {
  async show(ctx: HttpContext) {
    const c = await sudoContextFrom(ctx)
    const available = await resolveAvailableMethods(c, configuredSudoMethods(c.cfg))
    const methods = await Promise.all(
      available.map(async (m) => ({ id: m.id, ...(await m.describe(c)) }))
    )

    if (!methods.length) {
      // Nenhum método disponível é erro de CONFIGURAÇÃO do host, não usuário
      // preso: a tela informa e o log aponta o problema.
      ;(ctx as any).logger?.error(
        { accountId: c.accountId },
        'authkit: nenhum método de sudo disponível para a conta — verifique config.sudo.methods'
      )
    }

    return c.cfg.render!(ctx, 'account/confirm', {
      csrfToken: ctx.request.csrfToken,
      returnTo: c.returnTo,
      error: ctx.session.flashMessages.get('confirmError') ?? null,
      methods,
      preferredId: ctx.session.get(LAST_METHOD_SESSION_KEY) ?? null,
    })
  }
}
```

- [ ] **Step 5: Montar as rotas dos métodos**

Em `packages/authkit-server/src/host/register_auth_host.ts`, substitua o bloco de rotas do confirm (linhas 377-380):

```ts
      // Sudo mode (confirm identity): o GET lista os métodos; cada método
      // registra suas próprias rotas de verificação (SPI `SudoMethod`).
      router.get('/account/confirm', [C.accountConfirm, 'show'])
```

E, logo após o grupo, monte os métodos:

```ts
  // Rotas próprias dos métodos de sudo. Fora do grupo com AccountAuthMiddleware
  // apenas para os métodos que precisam ser alcançáveis por GET vindo de e-mail;
  // cada método aplica seu próprio guard quando necessário.
  {
    const helpers: SudoRouteHelpers = {
      contextFrom: sudoContextFrom,
      completeSudo,
      fail,
    }
    for (const method of SUDO_METHOD_DEFAULTS) {
      method.register?.(router, helpers)
    }
  }
```

Com os imports no topo do arquivo:

```ts
import { completeSudo, fail } from './sudo/runtime.js'
import { SUDO_METHOD_DEFAULTS, sudoContextFrom } from './controllers/account_confirm_controller.js'
import type { SudoRouteHelpers } from './sudo/types.js'
```

**Nota para o implementador:** a montagem usa `SUDO_METHOD_DEFAULTS` e não o config, porque rotas são registradas antes de o config lazy resolver — o mesmo motivo documentado em `AuthHostOptions` para `social`/`admin`/`rateLimit` ("a decisão de MONTAR as rotas acontece em tempo de registro"). Métodos configurados pelo host que registrem rotas próprias são montados via `AuthHostOptions` na Task 8.

- [ ] **Step 6: Rodar a suíte inteira**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts
```

Esperado: tudo verde. **Os 9 testes de caracterização da Task 1 devem passar sem edição.** Se algum falhar, o refactor mudou comportamento — corrija o código, não o teste.

- [ ] **Step 7: Commit**

```bash
git add packages/authkit-server/src packages/authkit-server/tests
git commit -m "refactor(sudo): controller passa a usar o SPI de métodos

O AccountConfirmController deixa de verificar credencial: agora só lista os
métodos disponíveis. A verificação vive em cada método, e a concessão só em
completeSudo. Remove isPasswordless, cujo docblock (linhas 36-41) descrevia
uma heurística com passkeys que o código (157-170) não implementava.

Os 9 testes de caracterização da Task 1 passam sem edição."
```

---

### Task 5: `oidcStepUp`

**Files:**
- Create: `packages/authkit-server/src/host/sudo/methods/oidc_step_up.ts`
- Test: `packages/authkit-server/tests/host/sudo_method_oidc_step_up.spec.ts`

**Interfaces:**
- Produces: `oidcStepUp(opts: { url: string }): SudoMethod` (id `'oidc-step-up'`).

- [ ] **Step 1: Escrever os testes**

Crie `packages/authkit-server/tests/host/sudo_method_oidc_step_up.spec.ts`:

```ts
import { test } from '@japa/runner'
import { oidcStepUp } from '../../src/host/sudo/methods/oidc_step_up.js'

function ctxWith(returnTo: string | null = null) {
  return { accountId: 'acc-1', account: { id: 'acc-1', email: 'u@e.com' }, returnTo, cfg: {}, ctx: {} } as any
}

test.group('sudoMethods.oidcStepUp', () => {
  test('está SEMPRE disponível — é o método que quebra o deadlock', async ({ assert }) => {
    assert.isTrue(await oidcStepUp({ url: '/auth/step-up' }).isAvailable(ctxWith()))
  })

  test('descreve um redirect para a URL do host', async ({ assert }) => {
    const d = await oidcStepUp({ url: '/auth/step-up' }).describe(ctxWith())
    assert.equal(d.kind, 'redirect')
    assert.equal(d.endpoint, '/auth/step-up')
  })

  test('propaga o returnTo na querystring, encodado', async ({ assert }) => {
    const d = await oidcStepUp({ url: '/auth/step-up' }).describe(ctxWith('/account/security'))
    assert.equal(d.endpoint, '/auth/step-up?return_to=%2Faccount%2Fsecurity')
  })

  test('não registra rotas — o fluxo sai do pacote', ({ assert }) => {
    assert.isUndefined(oidcStepUp({ url: '/auth/step-up' }).register)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_method_oidc_step_up.spec.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Crie `packages/authkit-server/src/host/sudo/methods/oidc_step_up.ts`:

```ts
import type { SudoContext, SudoMethod } from '../types.js'

export interface OidcStepUpOptions {
  /** Rota do HOST que inicia a reautenticação. Ex.: '/auth/step-up'. */
  url: string
}

/**
 * Confirmação por reautenticação OIDC (step-up), o mecanismo padrão do próprio
 * protocolo para provar identidade recente (`prompt=login` / `max_age`).
 *
 * SEMPRE disponível: é o único método que não exige nada previamente
 * cadastrado, e por isso é o que quebra o deadlock de hosts passwordless —
 * onde o usuário não tem senha e cadastrar passkey também exigiria sudo.
 *
 * NÃO registra rotas: o fluxo sai do pacote. Quem chama `completeSudo` é o
 * host, no seu callback, DEPOIS de validar o grant.
 *
 * Fluxo esperado do host:
 *
 * ```
 * POST /account/security/export
 *   requireSudo() → sem marca → redirect para este endpoint
 * GET  /auth/step-up
 *   grava flag de step-up NA SESSÃO; inicia Authorization Code + PKCE
 *   com prompt=login
 * GET  /auth/callback
 *   valida state/PKCE/nonce; vê a flag; chama completeSudo(); limpa a flag
 * ```
 *
 * Duas regras que o host PRECISA seguir:
 *
 * 1. A flag de step-up vive NA SESSÃO, nunca na querystring. Se trafegasse
 *    pela URL, qualquer um forjaria um callback que concede sudo.
 * 2. `completeSudo` só DEPOIS da validação completa do grant. É o
 *    `prompt=login` que garante que o provider forçou reautenticação, em vez
 *    de reaproveitar a sessão existente.
 */
export function oidcStepUp(opts: OidcStepUpOptions): SudoMethod {
  return {
    id: 'oidc-step-up',

    async isAvailable() {
      return true
    },

    async describe(c: SudoContext) {
      const qs = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
      return {
        labelKey: 'account.confirm.method.oidc_step_up',
        kind: 'redirect' as const,
        endpoint: `${opts.url}${qs}`,
      }
    },
  }
}
```

- [ ] **Step 4: Rodar e verificar que passam**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_method_oidc_step_up.spec.ts
```

Esperado: **4 passed**.

- [ ] **Step 5: Commit**

```bash
git add packages/authkit-server/src/host/sudo/methods/oidc_step_up.ts packages/authkit-server/tests/host/sudo_method_oidc_step_up.spec.ts
git commit -m "feat(sudo): método oidcStepUp — reautenticação via prompt=login

Sempre disponível: é o único método que não exige credencial previamente
cadastrada, e portanto o que quebra o deadlock de hosts passwordless. Não
registra rotas — quem chama completeSudo é o host, no callback, após validar
o grant. As duas regras de segurança do fluxo estão no docblock."
```

---

### Task 6: `magicLink`

**Files:**
- Create: `packages/authkit-server/src/host/sudo/methods/magic_link.ts`
- Test: `packages/authkit-server/tests/host/sudo_method_magic_link.spec.ts`

**Interfaces:**
- Produces: `magicLink(): SudoMethod` (id `'magic-link'`), `SUDO_LINK_SESSION_KEY`, `SUDO_LINK_TTL_MS`.

- [ ] **Step 1: Escrever os testes**

Crie `packages/authkit-server/tests/host/sudo_method_magic_link.spec.ts`:

```ts
import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { magicLink, SUDO_LINK_SESSION_KEY, SUDO_LINK_TTL_MS } from '../../src/host/sudo/methods/magic_link.js'

function ctxWith(opts: { email?: string | null; onSudoLink?: unknown; session?: Record<string, unknown> } = {}) {
  const session: Record<string, unknown> = { ...opts.session }
  return {
    accountId: 'acc-1',
    account: { id: 'acc-1', email: opts.email === undefined ? 'u@e.com' : opts.email },
    returnTo: null,
    cfg: { mail: opts.onSudoLink ? { onSudoLink: opts.onSudoLink } : {} },
    ctx: {
      session: {
        get: (k: string) => session[k],
        put: (k: string, v: unknown) => { session[k] = v },
        forget: (k: string) => { delete session[k] },
      },
    },
    _session: session,
  } as any
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex')

test.group('sudoMethods.magicLink — disponibilidade', () => {
  test('disponível quando há e-mail e hook de envio', async ({ assert }) => {
    assert.isTrue(await magicLink().isAvailable(ctxWith({ onSudoLink: async () => {} })))
  })

  test('indisponível sem hook de envio', async ({ assert }) => {
    assert.isFalse(await magicLink().isAvailable(ctxWith()))
  })

  test('indisponível sem e-mail na conta', async ({ assert }) => {
    assert.isFalse(await magicLink().isAvailable(ctxWith({ email: null, onSudoLink: async () => {} })))
  })
})

test.group('sudoMethods.magicLink — token', () => {
  test('token válido é aceito uma vez', async ({ assert }) => {
    const c = ctxWith({ onSudoLink: async () => {} })
    c._session[SUDO_LINK_SESSION_KEY] = { hash: hash('tok-1'), expiresAt: Date.now() + SUDO_LINK_TTL_MS }

    assert.isTrue(magicLink().__verifyToken(c, 'tok-1'))
  })

  test('token NÃO serve duas vezes', async ({ assert }) => {
    const c = ctxWith({ onSudoLink: async () => {} })
    c._session[SUDO_LINK_SESSION_KEY] = { hash: hash('tok-1'), expiresAt: Date.now() + SUDO_LINK_TTL_MS }

    assert.isTrue(magicLink().__verifyToken(c, 'tok-1'))
    assert.isFalse(magicLink().__verifyToken(c, 'tok-1'))
  })

  test('token expirado é rejeitado', async ({ assert }) => {
    const c = ctxWith({ onSudoLink: async () => {} })
    c._session[SUDO_LINK_SESSION_KEY] = { hash: hash('tok-1'), expiresAt: Date.now() - 1 }

    assert.isFalse(magicLink().__verifyToken(c, 'tok-1'))
  })

  test('token de OUTRA sessão é rejeitado (nada guardado nesta)', async ({ assert }) => {
    const c = ctxWith({ onSudoLink: async () => {} })
    assert.isFalse(magicLink().__verifyToken(c, 'tok-de-outro-browser'))
  })

  test('o segredo NÃO é guardado em claro na sessão', async ({ assert }) => {
    const c = ctxWith({ onSudoLink: async () => {} })
    magicLink().__issueToken(c)

    const stored = c._session[SUDO_LINK_SESSION_KEY] as { hash: string }
    assert.notInclude(JSON.stringify(stored), 'tok')
    assert.lengthOf(stored.hash, 64)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_method_magic_link.spec.ts
```

Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Crie `packages/authkit-server/src/host/sudo/methods/magic_link.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Router } from '@adonisjs/core/http'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js'

/** Token de sudo pendente, guardado na sessão que o pediu. */
export const SUDO_LINK_SESSION_KEY = 'authkit_sudo_link'

/** Mesma janela dos magic links de login. */
export const SUDO_LINK_TTL_MS = 5 * 60 * 1000

interface PendingLink {
  hash: string
  expiresAt: number
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * Confirmação por link enviado ao e-mail da conta.
 *
 * O TOKEN É PRÓPRIO, DE ESCOPO SUDO — nunca o token de login
 * (`issueMagicLinkToken`). Aquele é credencial de AUTENTICAÇÃO: reusá-lo faria
 * de um link de sudo vazado uma sessão completa.
 *
 * | propriedade | valor | razão |
 * |---|---|---|
 * | geração | `randomBytes(32)` hex | entropia de credencial |
 * | armazenamento | HASH na sessão que pediu | não guarda o segredo em claro |
 * | escopo | só marca sudo | nunca autentica |
 * | validade | 5 min | mesma janela dos magic links de login |
 * | uso | único (apagado no consumo) | replay |
 * | navegador | só o mesmo (vive na sessão) | step-up é reprova de QUEM ESTÁ ALI |
 *
 * O "só mesmo navegador" é propriedade desejada aqui, diferente do magic link
 * de login, onde é limitação conhecida.
 */
export function magicLink(): SudoMethod & {
  __issueToken(c: SudoContext): string
  __verifyToken(c: SudoContext, token: string): boolean
} {
  function issueToken(c: SudoContext): string {
    const token = randomBytes(32).toString('hex')
    const pending: PendingLink = { hash: sha256(token), expiresAt: Date.now() + SUDO_LINK_TTL_MS }
    c.ctx.session.put(SUDO_LINK_SESSION_KEY, pending)
    return token
  }

  function verifyToken(c: SudoContext, token: string): boolean {
    const pending = c.ctx.session.get(SUDO_LINK_SESSION_KEY) as PendingLink | undefined
    if (!pending) return false

    // Single-use: some na primeira tentativa, certa ou errada.
    c.ctx.session.forget(SUDO_LINK_SESSION_KEY)

    if (Date.now() > pending.expiresAt) return false

    const a = Buffer.from(sha256(token), 'hex')
    const b = Buffer.from(pending.hash, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  }

  return {
    id: 'magic-link',
    __issueToken: issueToken,
    __verifyToken: verifyToken,

    async isAvailable(c: SudoContext) {
      if (!c.account?.email) return false
      return typeof c.cfg?.mail?.onSudoLink === 'function'
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.magic_link',
        kind: 'action' as const,
        endpoint: '/account/confirm/magic-link',
      }
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm/magic-link', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        if (!c.account?.email) return h.fail(c, 'account.confirm.error')

        const token = issueToken(c)
        const qs = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
        const url = `/account/confirm/magic-link/${token}${qs}`

        try {
          await c.cfg.mail.onSudoLink({ email: c.account.email, sudoUrl: url })
        } catch {
          return h.fail(c, 'account.confirm.error')
        }

        ctx.session.flash('confirmNotice', 'account.confirm.magic_link_sent')
        const back = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
        return ctx.response.redirect(`/account/confirm${back}`)
      })

      router.get('/account/confirm/magic-link/:token', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        const token = ctx.params?.token as string | undefined
        if (!token || !verifyToken(c, token)) return h.fail(c, 'account.confirm.error')
        return h.completeSudo(c, 'magic-link')
      })
    },
  }
}
```

- [ ] **Step 4: Declarar o hook de mail**

Em `packages/authkit-server/src/define_config.ts`, dentro da interface `MailHooks` (onde vive `onMagicLink`), acrescente:

```ts
  /**
   * Envia o link de CONFIRMAÇÃO DE IDENTIDADE (sudo). Distinto de
   * `onMagicLink`: aquele autentica, este só concede sudo a quem já está
   * logado. Sem este hook, `sudoMethods.magicLink()` fica indisponível.
   */
  onSudoLink?: (data: { email: string; sudoUrl: string }) => Promise<void>;
```

- [ ] **Step 5: Rodar e verificar que passam**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_method_magic_link.spec.ts
```

Esperado: **8 passed**.

- [ ] **Step 6: Commit**

```bash
git add packages/authkit-server/src packages/authkit-server/tests/host/sudo_method_magic_link.spec.ts
git commit -m "feat(sudo): método magicLink com token de escopo próprio

O token de sudo NUNCA é o de login: randomBytes(32), hash na sessão que
pediu, single-use, 5 min. Reusar issueMagicLinkToken faria de um link de
sudo vazado uma sessão completa. Novo hook mail.onSudoLink, distinto de
onMagicLink justamente para que o host não confunda os dois."
```

---

### Task 7: Template Edge multi-método + i18n

**Files:**
- Modify: `packages/authkit-server/src/host/views/account/confirm.edge` (reescrito)
- Modify: `packages/authkit-server/src/host/i18n.ts` (pt-BR + en)
- Test: `packages/authkit-server/tests/host/edge_views.spec.ts` (acrescenta)

**Interfaces:**
- Consumes: props `{ csrfToken, returnTo, error, methods, preferredId }` da Task 4.

- [ ] **Step 1: Acrescentar os testes de view**

Adicione ao grupo `edge views (lib-owned)` em `tests/host/edge_views.spec.ts`:

```ts
  test('account/confirm.edge renderiza um bloco por método disponível', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::account/confirm', {
      csrfToken: 'tok',
      returnTo: '/account/security',
      error: null,
      preferredId: null,
      methods: [
        { id: 'password', kind: 'form', endpoint: '/account/confirm', labelKey: 'account.confirm.method.password',
          fields: [{ name: 'password', type: 'password', labelKey: 'account.confirm.password_label' }] },
        { id: 'oidc-step-up', kind: 'redirect', endpoint: '/auth/step-up', labelKey: 'account.confirm.method.oidc_step_up' },
      ],
    })

    assert.include(html, 'action="/account/confirm"')
    assert.include(html, 'name="password"')
    assert.include(html, 'href="/auth/step-up"')
    assert.include(html, 'value="/account/security"')
  })

  test('account/confirm.edge avisa quando não há método disponível', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::account/confirm', {
      csrfToken: 'tok', returnTo: null, error: null, preferredId: null, methods: [],
    })
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'account.confirm.no_methods'))
  })
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/edge_views.spec.ts
```

Esperado: FAIL — a view ainda espera `passwordless`/`passkeyAvailable`.

- [ ] **Step 3: Adicionar as chaves i18n**

Em `packages/authkit-server/src/host/i18n.ts`, no catálogo **en**, junto das demais `account.confirm.*`:

```ts
  "account.confirm.method.password": "Confirm with your password",
  "account.confirm.method.passkey": "Confirm with a passkey",
  "account.confirm.method.magic_link": "Email me a confirmation link",
  "account.confirm.method.oidc_step_up": "Sign in again to confirm",
  "account.confirm.magic_link_sent": "We sent a confirmation link to your email. It expires in 5 minutes.",
  "account.confirm.no_methods": "No confirmation method is available for this account. Contact support.",
```

E no catálogo **pt-BR**:

```ts
  "account.confirm.method.password": "Confirmar com a senha",
  "account.confirm.method.passkey": "Confirmar com passkey",
  "account.confirm.method.magic_link": "Receber link de confirmação por e-mail",
  "account.confirm.method.oidc_step_up": "Entrar de novo para confirmar",
  "account.confirm.magic_link_sent": "Enviamos um link de confirmação para o seu e-mail. Ele expira em 5 minutos.",
  "account.confirm.no_methods": "Nenhum método de confirmação está disponível para esta conta. Fale com o suporte.",
```

- [ ] **Step 4: Reescrever a view**

Substitua o conteúdo de `packages/authkit-server/src/host/views/account/confirm.edge` por:

```edge
@layout.authkit({ title: t('account.confirm.title') })
  <div class="mx-auto w-full max-w-sm space-y-6">
    <h1 class="text-xl font-semibold text-gray-900">{{ t('account.confirm.title') }}</h1>

    @if(error)
      <div class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{{ error }}</div>
    @end

    @if(!methods || methods.length === 0)
      <div class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {{ t('account.confirm.no_methods') }}
      </div>
    @else
      @each(method in methods)
        <div class="rounded-lg border border-gray-200 p-4">
          @if(method.kind === 'redirect')
            <a href="{{ method.endpoint }}"
               class="block w-full rounded-lg bg-gray-900 py-2 text-center text-sm font-medium text-white hover:bg-gray-700">
              {{ t(method.labelKey) }}
            </a>
          @else
            <form method="POST" action="{{ method.endpoint }}" class="space-y-3">
              <input type="hidden" name="_csrf" value="{{ csrfToken }}">
              @if(returnTo)
                <input type="hidden" name="return_to" value="{{ returnTo }}">
              @end

              @each(field in (method.fields || []))
                <label class="block text-sm font-medium text-gray-700" for="{{ field.name }}">
                  {{ t(field.labelKey) }}
                </label>
                <input id="{{ field.name }}" name="{{ field.name }}" type="{{ field.type }}" required
                       class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
              @end

              <button type="submit"
                      class="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white hover:bg-gray-700">
                {{ t(method.labelKey) }}
              </button>
            </form>
          @end
        </div>
      @end
    @end
  </div>
@end
```

**Nota para o implementador:** o JS de passkey saiu desta view. `passkey` tem `kind: 'action'` e o POST direto não produz a assertion WebAuthn — o host que usa o template Edge precisa do script. Registre isso como issue conhecida no CHANGELOG da Task 8: **o método passkey via template Edge fica degradado nesta versão**; hosts React (o caminho recomendado, e o do Projeto 2) implementam a chamada `navigator.credentials.get` na própria página. Não invente um script novo aqui sem teste que o exercite — é código de autenticação.

- [ ] **Step 5: Rodar a suíte inteira**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts
```

Esperado: tudo verde, incluindo os 9 da Task 1.

- [ ] **Step 6: Commit**

```bash
git add packages/authkit-server/src/host/views/account/confirm.edge packages/authkit-server/src/host/i18n.ts packages/authkit-server/tests/host/edge_views.spec.ts
git commit -m "feat(sudo): template do confirm renderiza lista de métodos

Some o estado morto 'passwordless && !passkeyAvailable', que renderizava um
aviso e nenhum caminho de ação. Chaves i18n novas em pt-BR e en.

CONHECIDO: passkey via template Edge fica degradado (o JS do WebAuthn saiu
da view). Hosts React implementam navigator.credentials.get na página."
```

---

### Task 8: Exports públicos, config de host e changeset

**Files:**
- Create: `packages/authkit-server/src/host/sudo/index.ts`
- Modify: `packages/authkit-server/index.ts`
- Modify: `packages/authkit-server/src/host/register_auth_host.ts` (`AuthHostOptions.sudoMethods`)
- Create: `.changeset/sudo-methods-spi.md`
- Test: `packages/authkit-server/tests/host/sudo_exports.spec.ts`

- [ ] **Step 1: Escrever o teste de superfície pública**

Crie `packages/authkit-server/tests/host/sudo_exports.spec.ts`:

```ts
import { test } from '@japa/runner'
import { sudoMethods, completeSudo } from '../../index.js'

test.group('superfície pública do SPI de sudo', () => {
  test('exporta os quatro métodos embutidos', ({ assert }) => {
    assert.isFunction(sudoMethods.password)
    assert.isFunction(sudoMethods.passkey)
    assert.isFunction(sudoMethods.oidcStepUp)
    assert.isFunction(sudoMethods.magicLink)
  })

  test('exporta completeSudo — o host precisa dele para o oidcStepUp', ({ assert }) => {
    assert.isFunction(completeSudo)
  })

  test('os ids são estáveis (vão no audit e na preferência)', ({ assert }) => {
    assert.equal(sudoMethods.password().id, 'password')
    assert.equal(sudoMethods.passkey().id, 'passkey')
    assert.equal(sudoMethods.oidcStepUp({ url: '/x' }).id, 'oidc-step-up')
    assert.equal(sudoMethods.magicLink().id, 'magic-link')
  })
})
```

- [ ] **Step 2: Rodar e verificar que falham**

```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts --files tests/host/sudo_exports.spec.ts
```

Esperado: FAIL — `sudoMethods` não é exportado.

- [ ] **Step 3: Criar o barrel**

Crie `packages/authkit-server/src/host/sudo/index.ts`:

```ts
import { password } from './methods/password.js'
import { passkey } from './methods/passkey.js'
import { oidcStepUp } from './methods/oidc_step_up.js'
import { magicLink } from './methods/magic_link.js'

/**
 * Métodos de confirmação de identidade (sudo mode), no mesmo padrão de factory
 * usado em `stores.*` e `retrievers.*` das libs irmãs.
 *
 * ```ts
 * defineConfig({
 *   sudo: {
 *     methods: [
 *       sudoMethods.oidcStepUp({ url: '/auth/step-up' }),
 *       sudoMethods.magicLink(),
 *       sudoMethods.passkey(),
 *       sudoMethods.password(),
 *     ],
 *   },
 * })
 * ```
 */
export const sudoMethods = { password, passkey, oidcStepUp, magicLink }

export type { SudoMethod, SudoContext, SudoMethodDescriptor, SudoRouteHelpers } from './types.js'
```

- [ ] **Step 4: Exportar do index do pacote**

Em `packages/authkit-server/index.ts`, junto do bloco que já exporta `markSudo` (linha ~352):

```ts
export { sudoMethods } from './src/host/sudo/index.js'
export { completeSudo, fail as failSudo, LAST_METHOD_SESSION_KEY } from './src/host/sudo/runtime.js'
export type {
  SudoMethod,
  SudoContext,
  SudoMethodDescriptor,
  SudoRouteHelpers,
} from './src/host/sudo/types.js'
```

- [ ] **Step 5: Permitir métodos customizados em tempo de registro**

Em `packages/authkit-server/src/host/register_auth_host.ts`, acrescente a `AuthHostOptions`:

```ts
  /**
   * Métodos de sudo cujas rotas devem ser montadas. Necessário aqui (e não só
   * no config) porque a decisão de MONTAR rotas acontece em tempo de registro,
   * antes de o config lazy resolver — mesma razão de `social`/`admin`/`rateLimit`.
   * Espelhe o `sudo.methods` de config/authkit.ts.
   *
   * Ausente → `[password(), passkey()]`.
   */
  sudoMethods?: SudoMethod[];
```

E troque a montagem da Task 4 para usar a opção:

```ts
    for (const method of opts?.sudoMethods ?? SUDO_METHOD_DEFAULTS) {
      method.register?.(router, helpers)
    }
```

- [ ] **Step 6: Criar o changeset**

Crie `.changeset/sudo-methods-spi.md`:

```markdown
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
5 min). `password` e `passkey` foram migrados para o SPI mantendo suas URLs.

**Breaking para telas custom:** as props de `account/confirm` mudaram de
`{ passwordless, passkeyAvailable }` para `{ methods, preferredId }`. Hosts que
usam o template Edge embutido não precisam fazer nada.

**Conhecido:** o método `passkey` via template Edge está degradado nesta versão
(o JS do WebAuthn saiu da view). Hosts React implementam
`navigator.credentials.get` na própria página.

Corrige também `isPasswordless`, cujo docblock descrevia uma heurística com
passkeys que o código não implementava.
```

- [ ] **Step 7: Rodar tudo — testes, typecheck e build**

```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts
npm run typecheck
npm run build
```

Esperado: suíte verde, typecheck limpo, build sem erro. **Confirme que os 9 testes de caracterização da Task 1 nunca foram editados:**

```bash
git log --oneline -- tests/host/account_confirm_controller.spec.ts
```

Esperado: exatamente **um** commit (o da Task 1). Se houver mais, algum passo mudou comportamento — investigue antes de abrir o PR.

- [ ] **Step 8: Commit**

```bash
git add packages/authkit-server .changeset/sudo-methods-spi.md
git commit -m "feat(sudo): exporta sudoMethods e completeSudo + changeset

completeSudo precisa ser público porque o host chama no callback do
oidcStepUp; sem ele, o host improvisaria com markSudo e perderia a
auditoria. AuthHostOptions.sudoMethods permite montar rotas de métodos
customizados, com a mesma justificativa de social/admin/rateLimit."
```

---

## Auto-revisão

**1. Cobertura do spec**

| requisito do spec | task |
|---|---|
| Contrato `SudoContext`/`SudoMethodDescriptor`/`SudoMethod` | 2 |
| `completeSudo` ponto único; `fail` centralizado | 2 |
| Filtragem por `isAvailable`; `isAvailable` que lança é omitido | 2 |
| `preferredId` em sessão | 2 |
| `password` migrado, URL legada `POST /account/confirm` | 3, 4 |
| `passkey` migrado, URLs legadas preservadas | 3, 4 |
| Interação "hash inutilizável" documentada | 3 |
| `oidcStepUp` sempre disponível, sem rotas, regras de segurança | 5 |
| `magicLink` token próprio, hash, single-use, 5 min, mesma sessão | 6 |
| `completeSudo` exportado publicamente | 8 |
| Props novas de `account/confirm` | 4, 7 |
| i18n pt-BR + en | 7 |
| Remoção de `isPasswordless` | 4 |
| Config `sudo.methods` com default `[password(), passkey()]` | 4, 8 |
| Testes atuais passam sem alteração | 1 (rede), 4/7/8 (verificação) |

Sem lacunas.

**2. Placeholders:** nenhum. Todo passo que muda código traz o código.

**3. Consistência de tipos:** `SudoContext` (Task 2) é consumido igual nas 3-6. `completeSudo(c, methodId)` tem a mesma assinatura em runtime.ts, nos métodos e no export público. `SUDO_LINK_SESSION_KEY`/`SUDO_LINK_TTL_MS` (Task 6) batem entre teste e implementação. Os ids (`password`, `passkey`, `oidc-step-up`, `magic-link`) são idênticos em métodos, testes e Task 8.

**Divergência do spec, deliberada:** o spec dizia que `sudoMethods.password()` registraria `POST /account/confirm/password`; o plano usa `POST /account/confirm`, a URL histórica. O próprio spec já corrigia isso na seção do método (`confirm.edge:21` posta no path literal), mas a inconsistência ficou registrada aqui para o revisor não tropeçar.

**Item novo, não previsto no spec:** o JS do WebAuthn sai do template Edge, degradando `passkey` para hosts Edge. Está declarado no CHANGELOG e no commit da Task 7. A alternativa — reescrever o script sem teste que o exercite — seria pior num caminho de autenticação.
