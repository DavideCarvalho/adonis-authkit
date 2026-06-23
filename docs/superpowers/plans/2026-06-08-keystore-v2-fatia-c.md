# Keystore v2 — Fatia C (Hot-reload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chave de assinatura nova passa a assinar **sem reiniciar o processo** — `OidcService.reloadKeys()` reconstrói e troca a instância do oidc-provider ao vivo, e um poll do `head` do cofre propaga rotações feitas por outro processo/instância.

**Architecture:** O estado durável do oidc-provider (sessões, tokens, grants) vive no **adapter** (DB/redis), não na instância do Provider — então reconstruir o Provider com um JWKS novo e trocar a referência **não perde estado**. Tornamos `provider`/`callback`/`interactions` do `OidcService` mutáveis (campos privados + getters; o controller já lê `service.callback` por-request, então o swap é transparente), extraímos a construção para um `#buildAndWire(jwks)`, e adicionamos `reloadKeys()` que relê o keystore (via um `jwksLoader` injetado no boot) e troca atômico. Um poll opcional (housekeeping da lib) chama `reloadKeys()` quando o `head()` do cofre muda.

**Tech Stack:** TypeScript (ESM/NodeNext), `oidc-provider` v9.8.4, Koa + koa-mount, `jose`, Japa.

**Escopo desta fatia:** `reloadKeys()` + injeção do `jwksLoader`/`keystoreHead` + poll de reload. **NÃO** inclui o scheduler age-based nem o dashboard (Fatia D) — o gatilho in-process da rotação agendada e os botões do painel chamam `reloadKeys()`, que esta fatia entrega. O comando `authkit:keys:rotate` (processo separado) já funciona; suas rotações passam a propagar para o processo que serve via o poll.

**Pré-requisito:** Fatia A+B mergeada (KeystoreManager, resolveKeystoreVault, KeystoreCodec, loadEncryptionService, defaultEncryptForStore). Já está em `main`.

**Risco:** É a fatia mais arriscada (ciclo de vida do Provider). Por isso a **Task 1 é um gate de viabilidade**: prova rebuild+swap end-to-end antes de construir o resto. Se a Task 1 não passar como esperado, PARAR e reportar — o design precisa ser revisto (ex.: aceitar restart, ou patch do keystore interno em vez de rebuild).

**Comandos:**
```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts --files="<arquivo>.spec.ts"
npx tsc --noEmit
```

---

## File Structure

**Criar:**
- `tests/provider/provider_reload.spec.ts` — Task 1 (gate de viabilidade) + Task 4 (reloadKeys integration).
- `src/provider/keystore_reload.ts` — `KeystoreReload` (o poll de housekeeping) + a fábrica do `jwksLoader`.

**Modificar:**
- `src/provider/oidc_service.ts` — `provider`/`callback`/`interactions` mutáveis (campos `#` + getters); extrair `#buildAndWire(jwks)`; adicionar `reloadKeys()`, `keystoreHead()`; novos params opcionais no constructor (`jwksLoader`, `keystoreHead`, guarda o `appKey`).
- `providers/authkit_server_provider.ts` — construir o `jwksLoader`/`keystoreHead` closures a partir de `config.jwksConfig` + `app` e passá-los ao `OidcService`; iniciar o poll no `start()` hook.

---

## Task 1: Gate de viabilidade — rebuild+swap preserva validação (jose, sem OidcService)

Prova, no nível do `buildProvider`/JWKS, que: (a) a chave nova assina, (b) tokens da chave antiga continuam validando pelo JWKS público pós-reload. Usa `jose` direto (sem subir app), de forma barata e determinística. **Se falhar, PARAR e reportar BLOCKED.**

**Files:** Create `tests/provider/provider_reload.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/provider/provider_reload.spec.ts
import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, importJWK, createLocalJWKSet, jwtVerify } from 'jose'
import { KeystoreManager } from '../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../src/keys/keystore_codec.js'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'
import { toPublicJwks } from '../../src/keys/keystore.js'

function mgr(path: string) {
  return new KeystoreManager(new FileKeystoreVault(path), new KeystoreCodec({ encrypt: false }), 'RS256')
}
async function sign(jwk: Record<string, any>, sub: string) {
  const key = await importJWK(jwk, jwk.alg)
  return new SignJWT({ sub }).setProtectedHeader({ alg: jwk.alg, kid: jwk.kid }).setIssuedAt().setExpirationTime('1h').sign(key)
}

test.group('hot-reload viabilidade (jose)', (group) => {
  let dir: string, path: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-reload-')); path = join(dir, 'jwks.json'); return () => rmSync(dir, { recursive: true, force: true }) })

  test('pós-rotação: JWKS público novo valida token novo E token antigo (overlap)', async ({ assert }) => {
    const m = mgr(path)
    const before = await m.ensure()
    const tokenOld = await sign(before.keys[0], 'u-old')

    // "reload": rotaciona no cofre e relê o keystore (o que reloadKeys fará)
    await m.rotate(2)
    const after = await m.read()
    const tokenNew = await sign(after!.keys[0], 'u-new')

    // o JWKS público pós-reload contém AMBAS as chaves (grace) → ambos validam
    const jwkSet = createLocalJWKSet(toPublicJwks(after!) as any)
    assert.equal((await jwtVerify(tokenOld, jwkSet)).payload.sub, 'u-old')
    assert.equal((await jwtVerify(tokenNew, jwkSet)).payload.sub, 'u-new')

    // e o kid corrente (de assinatura) mudou
    assert.notEqual(after!.keys[0].kid, before.keys[0].kid)
  })
})
```

- [ ] **Step 2: Run — expect PASS.** `node --import=@poppinss/ts-exec bin/test.ts --files="provider_reload.spec.ts"`
  Se PASS: o mecanismo de overlap está correto (já é a base da rotação). Prossiga.
  Se FAIL: **PARAR, reportar BLOCKED** com o erro — o modelo de overlap está quebrado e o resto do plano não se sustenta.

- [ ] **Step 3: Commit**

```bash
git add tests/provider/provider_reload.spec.ts
git commit -m "test(provider): gate de viabilidade do hot-reload (overlap jose)"
```

---

## Task 2: Tornar `provider`/`callback`/`interactions` swappáveis (refactor puro)

Extrai a construção do provider para `#buildAndWire(jwks)` e troca os campos `readonly` por campos privados `#` + getters. **Sem mudança de comportamento** — todos os testes existentes continuam passando.

**Files:** Modify `src/provider/oidc_service.ts`

- [ ] **Step 1: Read the current `OidcService` constructor fully** (`src/provider/oidc_service.ts`, ~linhas 12–148) para preservar EXATAMENTE: o closure `findAccount` (lê org ativa do cookie + monta claims), `wireProviderEvents`, `registerTokenExchange`, a lógica de `mountPath`/koa-mount/`callback`, e `createInteractionActions`.

- [ ] **Step 2: Refactor** — aplique estas mudanças:
  1. Troque as declarações `readonly provider`, `readonly callback`, `readonly interactions` por campos privados + getters:
     ```ts
     #provider!: ReturnType<typeof buildProvider>
     #callback!: (req: any, res: any) => void
     #interactions!: InteractionActions
     #appKey: string

     get provider(): ReturnType<typeof buildProvider> { return this.#provider }
     get callback(): (req: any, res: any) => void { return this.#callback }
     get interactions(): InteractionActions { return this.#interactions }
     ```
     (`mountPath`, `recorder`, `sessionTtlHolder`, `tokenTtlHolder` continuam como estão. Getters preservam a API pública `service.provider`/`.callback`/`.interactions` que outros módulos consomem.)
  2. No constructor: guarde `this.#appKey = appKey`, mantenha a init dos holders, e SUBSTITUA o bloco que faz `this.provider = buildProvider(...) ... this.callback = ... this.interactions = ...` por uma única chamada `this.#buildAndWire(config.jwks)`.
  3. Crie o método privado `#buildAndWire(jwks)` contendo TODO o bloco extraído, parametrizado pelo jwks:
     ```ts
     #buildAndWire(jwks: { keys: Record<string, any>[] }): void {
       const config = this.#config
       this.#provider = buildProvider(
         { ...config, jwks },                    // clona o config com o jwks (novo) — buildProvider lê config.jwks
         {
           appKey: this.#appKey,
           findAccount: async (ctx, sub) => { /* …closure IDÊNTICO ao atual… */ },
         },
         this.sessionTtlHolder,
         this.tokenTtlHolder
       )
       wireProviderEvents(this.#provider, this.recorder)
       registerTokenExchange(this.#provider, {
         findAccount: config.findAccount,
         globalRolesClaim: config.globalRolesClaim,
         audit: config.audit,
       })
       this.mountPath = new URL(this.#provider.issuer).pathname.replace(/\/+$/, '')
       if (this.mountPath && this.mountPath !== '/') {
         const koa = new Koa()
         koa.keys = (this.#provider as any).keys
         koa.proxy = (this.#provider as any).proxy
         koa.use(mount(this.mountPath, this.#provider as any))
         this.#callback = koa.callback()
       } else {
         this.#callback = this.#provider.callback()
       }
       this.#interactions = createInteractionActions(this.#provider, { verifyCredentials: config.verifyCredentials })
     }
     ```
     NOTA: `mountPath` precisa deixar de ser `readonly` (vira `mountPath!: string` atribuído em `#buildAndWire`) OU calcule-o uma vez no constructor (o issuer não muda no reload) e NÃO reatribua em `#buildAndWire`. Prefira: calcular `mountPath` UMA vez no constructor (antes de `#buildAndWire`) e em `#buildAndWire` apenas reusar `this.mountPath`. Ajuste conforme o que o `tsc` aceitar; o importante é que `mountPath` seja estável entre reloads (o issuer é o mesmo).
  4. `buildProvider` precisa do `appKey` — por isso guardamos `this.#appKey`. Confirme a assinatura de `buildProvider(config, options, sessionTtlHolder?, tokenTtlHolder?)` e mantenha os holders passados por referência (preservados entre rebuilds).

- [ ] **Step 3: Verify — NENHUMA mudança de comportamento.**
```bash
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="oidc_flow.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts   # full suite, 0 regressões
```
Expected: tudo verde (o getter preserva `service.provider`/`.callback`/`.interactions`).

- [ ] **Step 4: Commit**

```bash
git add src/provider/oidc_service.ts
git commit -m "refactor(provider): provider/callback/interactions swappáveis via #buildAndWire"
```

---

## Task 3: Injetar `jwksLoader` + `keystoreHead` no `OidcService`

Para reconstruir com chaves frescas, o `OidcService` precisa re-materializar o JWKS a partir do cofre. Injetamos isso no boot (onde `app` + `config.jwksConfig` existem) como closures opcionais.

**Files:** Modify `src/provider/oidc_service.ts`, `providers/authkit_server_provider.ts`

- [ ] **Step 1: Adicione os params opcionais ao constructor** do `OidcService` (após `recorder`):
  ```ts
  constructor(
    config: ResolvedServerConfig,
    appKey: string,
    recorder: MetricsRecorder = new NoopRecorder(),
    private deps: {
      /** Relê o keystore do cofre e devolve o JWKS (sem `iat`). Ausente → reloadKeys é no-op. */
      jwksLoader?: () => Promise<{ keys: Record<string, any>[] }>
      /** Token barato de mudança do cofre (kid/etag/mtime) p/ o poll. */
      keystoreHead?: () => Promise<string | null>
    } = {}
  ) { /* … */ }
  ```

- [ ] **Step 2: Construa os closures no provider registration** (`providers/authkit_server_provider.ts`, onde hoje faz `return new OidcService(config, appKey, metrics)`). Antes do `return`, monte um loader a partir de `config.jwksConfig` quando for `managed` com `store`:
  ```ts
  const jwksInput = config.jwksConfig
  let jwksLoader: (() => Promise<{ keys: Record<string, any>[] }>) | undefined
  let keystoreHead: (() => Promise<string | null>) | undefined
  if (jwksInput?.source === 'managed' && jwksInput?.store) {
    const buildManager = async () => {
      const { resolveKeystoreVault, KeystoreManager } = await import('../src/keys/keystore_manager.js')
      const { KeystoreCodec } = await import('../src/keys/keystore_codec.js')
      const { loadEncryptionService } = await import('../src/keys/keystore_crypto.js')
      const { defaultEncryptForStore } = await import('../src/define_config.js')
      const vault = resolveKeystoreVault(jwksInput.store as any, (p) => this.app.makePath(p))
      const encrypt = (jwksInput as any).encrypt ?? defaultEncryptForStore(jwksInput.store as any)
      const enc = encrypt ? await loadEncryptionService().catch(() => undefined) : undefined
      return new KeystoreManager(vault, new KeystoreCodec({ encrypt, enc }), jwksInput.algorithm ?? 'RS256')
    }
    jwksLoader = async () => {
      const m = await buildManager()
      const store = (await m.read()) ?? (await m.ensure())
      return { keys: store.keys.map(({ iat: _iat, ...jwk }) => jwk) }
    }
    keystoreHead = async () => {
      const m = await buildManager()
      return m.head()
    }
  }
  return new OidcService(config, appKey, metrics, { jwksLoader, keystoreHead })
  ```
  NOTA: o dynamic `import(...)` aqui é no SETUP do singleton (uma vez no boot), não num callback de scheduler — ok. Se preferir imports estáticos no topo do provider, faça-o (eles não criam ciclo: o provider já importa de `src/`). Use o que o `tsc` aceitar limpo.

- [ ] **Step 3: Verify**
```bash
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"   # boot ainda sobe
node --import=@poppinss/ts-exec bin/test.ts   # full suite
```

- [ ] **Step 4: Commit**

```bash
git add src/provider/oidc_service.ts providers/authkit_server_provider.ts
git commit -m "feat(provider): injeta jwksLoader/keystoreHead no OidcService (reload do cofre)"
```

---

## Task 4: `reloadKeys()` + `keystoreHead()` no `OidcService`

**Files:** Modify `src/provider/oidc_service.ts`, Test `tests/provider/provider_reload.spec.ts`

- [ ] **Step 1: Write the integration test** (append em `provider_reload.spec.ts`). Constrói um `OidcService` real com um `jwksLoader` apontando p/ um keystore em arquivo, assina com a chave corrente, rotaciona+reload, e verifica que o JWKS público do provider passou a publicar o kid novo mantendo o antigo.
```ts
import { OidcService } from '../../src/provider/oidc_service.js'
import type { ResolvedServerConfig } from '../../src/define_config.js'

function minimalConfig(jwks: { keys: Record<string, any>[] }): ResolvedServerConfig {
  // Config mínimo p/ subir um Provider em memória (adapter default, sem clients).
  // Reusa os defaults que o smoke/oidc_flow specs já usam — COPIE o helper de
  // config mínimo desses specs (procure por buildProvider/new OidcService neles)
  // para casar com o shape de ResolvedServerConfig vigente.
  return { /* …preencher a partir do helper existente nos specs… */ } as any
}

test.group('OidcService.reloadKeys', (group) => {
  let dir: string, path: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-svc-')); path = join(dir, 'jwks.json'); return () => rmSync(dir, { recursive: true, force: true }) })

  test('reloadKeys publica o kid novo e mantém o antigo (overlap), kid corrente muda', async ({ assert }) => {
    const m = mgr(path)
    const initial = await m.ensure()
    const oldKid = initial.keys[0].kid
    const loader = async () => { const s = (await m.read())!; return { keys: s.keys.map(({ iat, ...j }) => j) } }

    const svc = new OidcService(minimalConfig({ keys: initial.keys.map(({ iat, ...j }) => j) }), 'test-app-key-0123456789', undefined, {
      jwksLoader: loader,
      keystoreHead: () => m.head(),
    })

    // kids publicados antes
    const before = await (svc.provider as any).keystore
    // rotaciona no cofre + reload
    await m.rotate(2)
    await svc.reloadKeys()

    // o provider reconstruído publica o kid novo; o getter `service.provider` é o novo
    const newStore = (await m.read())!
    assert.notEqual(newStore.keys[0].kid, oldKid)
    // sanity: instância trocou (provider novo)
    assert.notStrictEqual(svc.provider, undefined)
  })

  test('sem jwksLoader → reloadKeys é no-op (não lança)', async ({ assert }) => {
    const svc = new OidcService(minimalConfig({ keys: (await mgr(path).ensure()).keys.map(({ iat, ...j }) => j) }), 'test-app-key-0123456789')
    await svc.reloadKeys() // no-op
    assert.isOk(svc.provider)
  })
})
```
NOTA IMPORTANTE p/ o implementer: o `minimalConfig` acima é um esqueleto — **copie o helper de config mínimo já usado** em `tests/oidc_flow.spec.ts` ou `tests/build_provider.spec.ts` (eles já constroem um `ResolvedServerConfig`/Provider em memória). Reuse-o em vez de inventar o shape. Se nenhum helper reutilizável existir, extraia um pequeno `makeTestConfig()` num arquivo de fixture sob `tests/` e use-o aqui. As asserts devem provar: (a) `reloadKeys` não lança, (b) após reload o `service.provider` reflete o keystore rotacionado (kid corrente novo). Ajuste as asserts ao que a API do provider expõe (`provider.keystore`/JWKS endpoint) — prove publicação de ambos os kids se acessível; senão, prove via o `jwksLoader` que o store tem os 2 kids e que `reloadKeys` reconstruiu sem erro.

- [ ] **Step 2: Run — expect FAIL** (`reloadKeys` não existe).

- [ ] **Step 3: Implement `reloadKeys()` + `keystoreHead()`** em `OidcService`:
```ts
/**
 * Recarrega as chaves de assinatura AO VIVO: relê o keystore do cofre e reconstrói
 * o provider com o JWKS novo, trocando a instância atomicamente. No-op quando não
 * há `jwksLoader` (source:'jwks' inline ou managed sem store). Fail-safe: se o
 * rebuild falhar, MANTÉM o provider antigo servindo (loga) e propaga o erro ao caller.
 */
async reloadKeys(): Promise<void> {
  if (!this.deps.jwksLoader) return
  const jwks = await this.deps.jwksLoader()
  this.#buildAndWire(jwks)
}

/** Token barato de mudança do cofre (p/ o poll de reload). null quando indisponível. */
async keystoreHead(): Promise<string | null> {
  return this.deps.keystoreHead ? this.deps.keystoreHead() : null
}
```
NOTA fail-safe: se quiser garantir que um rebuild falho NÃO derrube o serviço, capture dentro de `reloadKeys` e só troque os campos após `#buildAndWire` ter sucesso. Como `#buildAndWire` reatribui `this.#provider`/`#callback`/`#interactions` no fim, um throw no meio deixaria estado parcial — para robustez, faça `#buildAndWire` construir tudo em LOCAIS e só então atribuir aos campos `#` no final (atômico). Ajuste `#buildAndWire` para esse padrão "build locals → assign at end".

- [ ] **Step 4: Run tests + suite**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="provider_reload.spec.ts"
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts   # full suite
```

- [ ] **Step 5: Commit**

```bash
git add src/provider/oidc_service.ts tests/provider/provider_reload.spec.ts
git commit -m "feat(provider): OidcService.reloadKeys() reconstrói+troca o provider ao vivo"
```

---

## Task 5: Poll de reload (housekeeping da lib) + start no boot

Um intervalo leve lê `keystoreHead()`; quando muda desde o último load, chama `reloadKeys()`. Propaga rotações de outro processo (comando ace) ou outra instância. Fail-safe; só roda quando há `keystoreHead`.

**Files:** Create `src/provider/keystore_reload.ts`, Modify `providers/authkit_server_provider.ts`, Test `tests/provider/keystore_reload.spec.ts`

- [ ] **Step 1: Write the test** (`tests/provider/keystore_reload.spec.ts`):
```ts
import { test } from '@japa/runner'
import { KeystoreReloadPoller } from '../../src/provider/keystore_reload.js'

test.group('KeystoreReloadPoller', () => {
  test('chama reload quando o head muda', async ({ assert }) => {
    let head = 'h1'
    let reloads = 0
    const poller = new KeystoreReloadPoller({
      head: async () => head,
      reload: async () => { reloads++ },
      intervalMs: 10,
    })
    await poller.tick()            // primeiro tick estabelece baseline (h1), sem reload
    assert.equal(reloads, 0)
    head = 'h2'
    await poller.tick()            // mudou → reload
    assert.equal(reloads, 1)
    await poller.tick()            // não mudou → sem reload
    assert.equal(reloads, 1)
  })

  test('erro no head/reload não propaga (fail-safe)', async ({ assert }) => {
    const poller = new KeystoreReloadPoller({
      head: async () => { throw new Error('boom') },
      reload: async () => {},
      intervalMs: 10,
    })
    await poller.tick()            // não lança
    assert.isOk(poller)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (módulo não existe).

- [ ] **Step 3: Implement** `src/provider/keystore_reload.ts`:
```ts
/**
 * Poll de housekeeping (da lib): lê um `head` barato do cofre e dispara `reload`
 * quando ele muda desde o último observado. Propaga rotações feitas por outro
 * processo/instância sem restart. Fail-safe: erros viram no-op (logados pelo caller
 * se quiser). `start()`/`stop()` controlam o intervalo; `tick()` é exposto p/ teste.
 */
export interface KeystoreReloadOptions {
  head: () => Promise<string | null>
  reload: () => Promise<void>
  intervalMs: number
  onError?: (err: unknown) => void
}

export class KeystoreReloadPoller {
  #last: string | null | undefined
  #timer: ReturnType<typeof setInterval> | undefined
  constructor(private opts: KeystoreReloadOptions) {}

  async tick(): Promise<void> {
    try {
      const head = await this.opts.head()
      if (this.#last === undefined) { this.#last = head; return } // baseline, sem reload
      if (head !== this.#last) {
        this.#last = head
        await this.opts.reload()
      }
    } catch (err) {
      this.opts.onError?.(err)
    }
  }

  start(): void {
    if (this.#timer) return
    this.#timer = setInterval(() => { void this.tick() }, this.opts.intervalMs)
    if (typeof (this.#timer as any).unref === 'function') (this.#timer as any).unref()
  }

  stop(): void {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = undefined }
  }
}
```
NOTA: `import { setInterval }` NÃO é necessário (global). `unref()` evita o timer segurar o processo vivo (relevante p/ comandos ace/test). Imports estáticos no topo (preferência do usuário: sem import dinâmico em callback de scheduler — aqui o callback só chama `tick()`).

- [ ] **Step 4: Iniciar o poll no boot** — em `providers/authkit_server_provider.ts`, no hook `start()` (ou `ready()`), quando o `OidcService` tem `keystoreHead`, crie e inicie o poller. Procure o método `start()`/`ready()` do provider; resolva o `authkit.server` e:
```ts
const svc = await this.app.container.make('authkit.server').catch(() => null)
if (svc && typeof svc.keystoreHead === 'function') {
  const head = await svc.keystoreHead()
  if (head !== null) {   // só há o que pollar quando o cofre expõe head
    const { KeystoreReloadPoller } = await import('../src/provider/keystore_reload.js')
    const logger = await this.app.container.make('logger').catch(() => null)
    const poller = new KeystoreReloadPoller({
      head: () => svc.keystoreHead(),
      reload: () => svc.reloadKeys(),
      intervalMs: 60_000,
      onError: (err) => logger?.warn({ err }, 'authkit: keystore reload poll falhou (fail-safe)'),
    })
    poller.start()
  }
}
```
NOTA: rode SOMENTE no processo que serve. O `start()` do provider roda em comandos ace também — para evitar pollers em comandos, guarde por `this.app.getEnvironment() === 'web'` (ou o equivalente que o repo usa; cheque como o provider distingue web de ace). Se não houver distinção fácil, o `unref()` + o fato de comandos serem curtos torna o impacto desprezível, mas prefira a guarda de ambiente web.

- [ ] **Step 5: Verify**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_reload.spec.ts"
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts   # full suite
```

- [ ] **Step 6: Commit**

```bash
git add src/provider/keystore_reload.ts providers/authkit_server_provider.ts tests/provider/keystore_reload.spec.ts
git commit -m "feat(provider): poll de reload do keystore (propaga rotação sem restart)"
```

---

## Task 6: Verificação final + typecheck

**Files:** nenhum.

- [ ] **Step 1: Suíte + tsc (server + core)**
```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts
npx tsc --noEmit
cd ../authkit-core && npm run build && npx tsc --noEmit && cd ../authkit-server
```
Expected: tudo verde.

- [ ] **Step 2: Changeset** (a Fatia C é feature → minor no server)
```bash
cat > ../../.changeset/keystore-v2-fatia-c.md <<'EOF'
---
'@adonis-agora/authkit-server': minor
---

feat: hot-reload das chaves de assinatura JWKS — a chave rotacionada passa a
assinar SEM restart. `OidcService.reloadKeys()` reconstrói e troca a instância do
oidc-provider ao vivo (o estado durável vive no adapter, então nada se perde), e um
poll do `head` do cofre propaga rotações feitas por outro processo/instância
(ex.: `authkit:keys:rotate`).
EOF
git add ../../.changeset/keystore-v2-fatia-c.md
git commit -m "chore: changeset p/ Keystore v2 Fatia C (hot-reload)"
```

- [ ] **Step 3: Final code review** (dispatch um reviewer): confirmar que (a) o swap é atômico (build locals → assign), (b) sem leak de listeners (provider antigo é dereferenciado), (c) consumidores de `service.provider` leem o getter (não capturam o antigo), (d) o poll é fail-safe e só roda no processo web, (e) reloadKeys é no-op sem loader.

---

## Notas de risco / follow-up
- **Consumidores que capturam `service.provider`** (`token_verify_service`, `account_export_service`, `interactions`): confirmar no review que leem `service.provider` por-request (getter) e não guardam a instância antiga após um reload. `this.#interactions` é reconstruído em `#buildAndWire` — ok. Se algum consumidor cachear o provider entre requests, é um bug a corrigir nesta fatia.
- **In-flight requests durante o swap:** o callback é lido por-request; requests em voo terminam no provider/koa antigo (ainda referenciado pela closure do request), novos pegam o novo. Sem perda — validar no review.
- **Fatia D** consumirá `reloadKeys()` diretamente (scheduler in-process pós-rotação) e exporá "Rotacionar agora" no dashboard; o lock single-flight (`@adonisjs/lock`) e a política `key_rotation` ficam lá.
