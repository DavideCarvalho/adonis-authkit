# Keystore v2 — Fatia D1 (Backend: rotação agendada + política + endpoints) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rotação automática age-based das chaves JWKS (housekeeping da lib, single-flight via `@adonisjs/lock`), uma política `key_rotation` em runtime settings, e endpoints admin de status + "rotacionar agora" — tudo consumindo o `reloadKeys()` (Fatia C) para aplicar ao vivo.

**Architecture:** Uma setting `key_rotation` (`{enabled,maxAgeDays,keep}`, default OFF) resolvida via o mesmo padrão de `otp_lockout`. Um `KeyRotationScheduler` (housekeeping na lib, igual ao `KeystoreReloadPoller`: intervalo, web-only, fail-safe, `unref`) que, quando a chave passa de `maxAgeDays`, adquire um lock single-flight e chama `OidcService.rotateKeys()`. `OidcService` ganha `rotateKeys(keep,retire)` (rotaciona via um `keystoreManager` injetado → `reloadKeys()` → audit `keys.rotated`) e `keystoreAgeDays()`; `reloadKeys()` passa a ser **serializado** (mutex) já que scheduler, poll e o endpoint admin podem chamá-lo concorrentemente. Endpoints admin `GET /keys` (status) e `POST /keys/rotate` reutilizam a admin API existente.

**Tech Stack:** TypeScript (ESM/NodeNext), `@adonisjs/lock` v2.1.0 (peer opt-in, lazy), runtime settings, Japa.

**Escopo (D1 = backend só):** setting + scheduler + lock + `rotateKeys`/`keystoreAgeDays` + reload mutex + **DOIS tiers de endpoints** (Admin REST API Bearer-key p/ o `authkit-sdk` backend; Console JSON API session-authed p/ o browser/React) + métodos `keys.*` no `authkit-sdk`. **NÃO** inclui o React (client tipado + hooks TanStack + componente) — isso é a Fatia D2.

> **Segurança (dois tiers — o repo já faz isso):** a chave de assinatura é a chave-mestra do IdP; **NUNCA** expor a admin API key no browser. Por isso há dois caminhos: a **Admin REST API** (`/api/authkit/v1/keys`, guard `adminApiGuard` = Bearer key) p/ backend/SDK; e a **Console JSON API** (`{adminPrefix}/api/keys`, guard `adminGuard` = sessão + role admin) que o React SPA do console consome no browser. O React (D2) fala SÓ com a console API session-authed.

**Pré-requisitos (em `main`):** Fatia A+B (KeystoreManager etc.) e Fatia C (`OidcService.reloadKeys()`, `#deps.{jwksLoader,keystoreHead}`, `KeystoreReloadPoller`, `#startKeystoreReloadPoll`).

**Comandos:**
```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts --files="<arquivo>.spec.ts"
npx tsc --noEmit
```

---

## File Structure

**Criar:**
- `src/host/key_rotation.ts` — `KEY_ROTATION_DEFAULTS`, `KeyRotationSetting`/`ResolvedKeyRotationSetting`, `resolveEffectiveKeyRotation(settings)`.
- `src/provider/key_rotation_scheduler.ts` — `KeyRotationScheduler` (tick + start/stop).
- `src/provider/single_flight_lock.ts` — `makeSingleFlightLock()` (lazy `@adonisjs/lock`, degrade p/ no-lock).
- `src/host/admin_api/api_keys_controller.ts` — `status` + `rotate` (Admin REST API, Bearer).
- `src/host/admin_console/console_keys_controller.ts` — `status` + `rotate` (Console JSON API, sessão+role; espelha o controller de settings do console).
- `src/keys_resource.ts` (no `authkit-sdk`) — recurso `keys` (`status()`, `rotate()`) p/ os drivers remote+embedded.
- Testes: `tests/host/key_rotation.spec.ts`, `tests/provider/key_rotation_scheduler.spec.ts`, `tests/provider/single_flight_lock.spec.ts`, `tests/host/admin_api/api_keys.spec.ts`, `tests/host/admin_console/console_keys.spec.ts`, + teste no `authkit-sdk`.

**Modificar:**
- `src/host/runtime_toggles.ts` — adicionar `KEY_ROTATION: 'key_rotation'` em `SETTING_KEYS`.
- `src/provider/oidc_service.ts` — `#deps.keystoreManager`; `rotateKeys()`, `keystoreAgeDays()`; serializar `reloadKeys()` (mutex); um getter `runtimeSettings()` (SettingsCapability sem request) p/ o scheduler/endpoints.
- `providers/authkit_server_provider.ts` — injetar `keystoreManager` closure + a `SettingsCapability`; `#startKeyRotationScheduler()` no `start()`.
- `packages/authkit-server/package.json` — `@adonisjs/lock` em `peerDependencies` (+ `peerDependenciesMeta` opcional) via `catalog:adonis`.
- `src/host/register_auth_host.ts` — rotas REST `GET/POST /keys` (grupo `adminApiGuard`) **e** rotas console `GET/POST {ap}/api/keys` (grupo `adminGuard`); registrar os controllers no objeto `C`.
- `packages/authkit-sdk/src/index.ts` (+ remote/embedded drivers) — expor `authkit.keys`.

---

## Task 1: Setting `key_rotation` (resolver + defaults)

**Files:** Create `src/host/key_rotation.ts`; Modify `src/host/runtime_toggles.ts`; Test `tests/host/key_rotation.spec.ts`

- [ ] **Step 1: Add the SETTING_KEY**
Em `src/host/runtime_toggles.ts`, no objeto `SETTING_KEYS`, adicione (após `ACCOUNT_EXPIRATION`):
```ts
  KEY_ROTATION: 'key_rotation',
```

- [ ] **Step 2: Write the failing test** (`tests/host/key_rotation.spec.ts`)
```ts
import { test } from '@japa/runner'
import { resolveEffectiveKeyRotation, KEY_ROTATION_DEFAULTS } from '../../src/host/key_rotation.js'

function settingsWith(value: unknown) {
  return { getSetting: async () => value } as any
}

test.group('resolveEffectiveKeyRotation', () => {
  test('ausente → defaults (enabled:false)', async ({ assert }) => {
    assert.deepEqual(await resolveEffectiveKeyRotation(settingsWith(null)), KEY_ROTATION_DEFAULTS)
    assert.isFalse(KEY_ROTATION_DEFAULTS.enabled)
    assert.equal(KEY_ROTATION_DEFAULTS.maxAgeDays, 90)
    assert.equal(KEY_ROTATION_DEFAULTS.keep, 2)
  })
  test('valores válidos são aplicados', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation(settingsWith({ enabled: true, maxAgeDays: 30, keep: 3 }))
    assert.deepEqual(r, { enabled: true, maxAgeDays: 30, keep: 3 })
  })
  test('valores inválidos caem no default por-campo', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation(settingsWith({ enabled: 'x', maxAgeDays: 0, keep: -1 }))
    assert.deepEqual(r, { enabled: false, maxAgeDays: 90, keep: 2 })
  })
  test('erro de leitura → defaults (fail-safe)', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation({ getSetting: async () => { throw new Error('db') } } as any)
    assert.deepEqual(r, KEY_ROTATION_DEFAULTS)
  })
})
```

- [ ] **Step 3: Run — expect FAIL** (module missing).

- [ ] **Step 4: Implement** `src/host/key_rotation.ts` (mirrors `otp_lockout.ts`)
```ts
import type { SettingsCapability } from './runtime_settings.js'
import { SETTING_KEYS } from './runtime_toggles.js'

export interface KeyRotationSetting {
  enabled?: boolean
  maxAgeDays?: number
  keep?: number
}
export interface ResolvedKeyRotationSetting {
  enabled: boolean
  maxAgeDays: number
  keep: number
}
export const KEY_ROTATION_DEFAULTS: ResolvedKeyRotationSetting = {
  enabled: false,
  maxAgeDays: 90,
  keep: 2,
}

/** Resolve a setting `key_rotation` em runtime (fail-safe → defaults). */
export async function resolveEffectiveKeyRotation(
  settings: SettingsCapability
): Promise<ResolvedKeyRotationSetting> {
  try {
    const raw = await settings.getSetting(SETTING_KEYS.KEY_ROTATION)
    if (raw === null || raw === undefined) return KEY_ROTATION_DEFAULTS
    if (typeof raw !== 'object' || Array.isArray(raw)) return KEY_ROTATION_DEFAULTS
    const s = raw as KeyRotationSetting
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : KEY_ROTATION_DEFAULTS.enabled,
      maxAgeDays:
        typeof s.maxAgeDays === 'number' && s.maxAgeDays >= 1
          ? Math.floor(s.maxAgeDays)
          : KEY_ROTATION_DEFAULTS.maxAgeDays,
      keep:
        typeof s.keep === 'number' && s.keep >= 1 ? Math.floor(s.keep) : KEY_ROTATION_DEFAULTS.keep,
    }
  } catch {
    return KEY_ROTATION_DEFAULTS
  }
}
```

- [ ] **Step 5: Run — expect PASS (4) + commit**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="key_rotation.spec.ts"
npx tsc --noEmit
git add src/host/key_rotation.ts src/host/runtime_toggles.ts tests/host/key_rotation.spec.ts
git commit -m "feat(keys): setting key_rotation (resolver + defaults OFF/90d/keep2)"
```

---

## Task 2: Serializar `reloadKeys()` (mutex) + `keystoreAgeDays()` + injetar `keystoreManager`

**Files:** Modify `src/provider/oidc_service.ts`; Test append em `tests/provider/provider_reload.spec.ts`

- [ ] **Step 1: Write failing tests** (append em `tests/provider/provider_reload.spec.ts`)
```ts
test.group('OidcService reload serialization + age', (group) => {
  test('reloadKeys concorrentes não constroem providers sobrepostos (serializado)', async ({ assert }) => {
    const dirX = mkdtempSync(join(tmpdir(), 'authkit-ser-')); const pathX = join(dirX, 'jwks.json')
    try {
      const m = mgr(pathX); await m.ensure()
      const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) }, makePath: (p: string) => p } as any
      const cfg = await configProvider.resolve(fakeApp, defineConfig({
        issuer: 'http://localhost:9793', adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256', store: pathX, encrypt: false }, clients: [], accountStore: fakeAccountStore(),
      }))
      let building = 0, maxConcurrent = 0
      const svc = new OidcService(cfg!, 'a'.repeat(32), undefined, {
        jwksLoader: async () => { building++; maxConcurrent = Math.max(maxConcurrent, building); await new Promise((r) => setTimeout(r, 20)); building--; const s = (await m.read())!; return { keys: s.keys.map(({ iat, ...j }) => j) } },
        keystoreHead: () => m.head(),
      })
      await Promise.all([svc.reloadKeys(), svc.reloadKeys(), svc.reloadKeys()])
      assert.equal(maxConcurrent, 1) // nunca dois rebuilds simultâneos
    } finally { rmSync(dirX, { recursive: true, force: true }) }
  })

  test('keystoreAgeDays reflete a idade da chave corrente (0 recém-criada)', async ({ assert }) => {
    const dirY = mkdtempSync(join(tmpdir(), 'authkit-age-')); const pathY = join(dirY, 'jwks.json')
    try {
      const m = mgr(pathY); await m.ensure()
      const fakeApp = { container: { make: async () => ({ connection: () => new RedisMock() }) }, makePath: (p: string) => p } as any
      const cfg = await configProvider.resolve(fakeApp, defineConfig({
        issuer: 'http://localhost:9794', adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256', store: pathY, encrypt: false }, clients: [], accountStore: fakeAccountStore(),
      }))
      const svc = new OidcService(cfg!, 'a'.repeat(32), undefined, {
        jwksLoader: async () => { const s = (await m.read())!; return { keys: s.keys.map(({ iat, ...j }) => j) } },
        keystoreHead: () => m.head(),
        keystoreManager: async () => m,
      })
      assert.equal(await svc.keystoreAgeDays(), 0)
    } finally { rmSync(dirY, { recursive: true, force: true }) }
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`keystoreManager` dep / `keystoreAgeDays` missing; serialization assert may fail).

- [ ] **Step 3: Implement** em `src/provider/oidc_service.ts`:
  1. Estenda `#deps` (e o tipo do 4º param do constructor + o getter, se houver) com:
     ```ts
     keystoreManager?: () => Promise<import('../keys/keystore_manager.js').KeystoreManager>
     ```
  2. Adicione um campo de mutex e serialize `reloadKeys`:
     ```ts
     #reloadChain: Promise<void> = Promise.resolve()

     async reloadKeys(): Promise<void> {
       const run = async () => {
         const loader = this.#deps.jwksLoader
         if (!loader) return
         const jwks = await loader()
         this.#buildAndWire(jwks)
       }
       // serializa: encadeia após o reload em voo (erros não quebram a cadeia)
       this.#reloadChain = this.#reloadChain.then(run, run)
       return this.#reloadChain
     }
     ```
  3. Adicione `keystoreAgeDays()` e `rotateKeys()`:
     ```ts
     /** Idade (dias) da chave de assinatura corrente, ou null (sem keystore gerenciável). */
     async keystoreAgeDays(): Promise<number | null> {
       const build = this.#deps.keystoreManager
       if (!build) return null
       const { signingKeyAgeDays } = await import('../keys/keystore.js')
       const m = await build()
       return signingKeyAgeDays(await m.read())
     }

     /**
      * Rotaciona a chave de assinatura e aplica ao vivo (rotate → reloadKeys → audit
      * keys.rotated). No-op (lança) quando não há keystore gerenciável. Retorna o
      * resultado da rotação. Usado pelo scheduler e pelo endpoint admin "rotacionar agora".
      */
     async rotateKeys(keep: number, retire = false): Promise<{ newKid: string; retiredKids: string[]; keptKids: string[] }> {
       const build = this.#deps.keystoreManager
       if (!build) throw new Error('AuthKit: rotação indisponível (jwks não é managed+store).')
       const m = await build()
       const { newKid, retiredKids, store } = await m.rotate(keep, retire)
       await this.reloadKeys()
       const keptKids = store.keys.map((k) => k.kid as string)
       await this.#config.audit?.record({ type: 'keys.rotated', metadata: { newKid, retiredKids, keptKids, retire } }).catch(() => {})
       return { newKid, retiredKids, keptKids }
     }
     ```
  NOTA: confirme como o `#deps` é tipado/atribuído (Fatia C usou `#deps` + getters `jwksLoader`/`keystoreHead`). Adicione `keystoreManager` ao mesmo objeto de deps e ao tipo do parâmetro do constructor. Use import dinâmico de `keystore.js` em `keystoreAgeDays` (ou import estático no topo — o que `tsc` aceitar sem ciclo).

- [ ] **Step 4: Run + suite**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="provider_reload.spec.ts"
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts   # full suite
```

- [ ] **Step 5: Commit**
```bash
git add src/provider/oidc_service.ts tests/provider/provider_reload.spec.ts
git commit -m "feat(provider): reloadKeys serializado + rotateKeys()/keystoreAgeDays() no OidcService"
```

---

## Task 3: Injetar `keystoreManager` no provider registration

**Files:** Modify `providers/authkit_server_provider.ts`

- [ ] **Step 1: Estenda os closures** — onde hoje monta `buildManager`/`jwksLoader`/`keystoreHead` (dentro do `if (jwksInput?.source === 'managed' && jwksInput?.store)`), adicione um `keystoreManager` que expõe o `buildManager`:
```ts
const keystoreManager = async () => buildManager()
// ...
return new OidcService(config, appKey, metrics, { jwksLoader, keystoreHead, keystoreManager })
```
(Reusa o MESMO `buildManager` — mesma resolução de vault+codec+encryption do boot/rotate.)

- [ ] **Step 2: Verify**
```bash
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts
```

- [ ] **Step 3: Commit**
```bash
git add providers/authkit_server_provider.ts
git commit -m "feat(provider): injeta keystoreManager no OidcService (rotateKeys/age)"
```

---

## Task 4: `single_flight_lock` (`@adonisjs/lock` opt-in, degrade p/ no-lock)

**Files:** Create `src/provider/single_flight_lock.ts`; Modify `packages/authkit-server/package.json`; Test `tests/provider/single_flight_lock.spec.ts`

- [ ] **Step 1: Add `@adonisjs/lock` as optional peer** em `packages/authkit-server/package.json`:
  - Em `peerDependencies`: `"@adonisjs/lock": "catalog:adonis"`.
  - Em `peerDependenciesMeta` (criar a chave se não existir): `"@adonisjs/lock": { "optional": true }`.
  (Confirme o formato das outras peers — siga o mesmo `catalog:adonis`.)

- [ ] **Step 2: Write the failing test** (`tests/provider/single_flight_lock.spec.ts`)
```ts
import { test } from '@japa/runner'
import { makeSingleFlightLock } from '../../src/provider/single_flight_lock.js'

test.group('makeSingleFlightLock', () => {
  test('sem @adonisjs/lock → roda fn (single-instance, no-lock)', async ({ assert }) => {
    // loader que simula pacote ausente
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => null })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 1)
  })

  test('com lock adquirido → roda fn e libera', async ({ assert }) => {
    let released = false
    const fakeLock = { acquireImmediately: async () => true, release: async () => { released = true } }
    const fakeService = { use: () => ({ createLock: () => fakeLock }) }
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => fakeService as any })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 1)
    assert.isTrue(released)
  })

  test('lock NÃO adquirido → não roda fn (outra instância já rotaciona)', async ({ assert }) => {
    const fakeLock = { acquireImmediately: async () => false, release: async () => {} }
    const fakeService = { use: () => ({ createLock: () => fakeLock }) }
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => fakeService as any })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 0)
  })
})
```

- [ ] **Step 3: Implement** `src/provider/single_flight_lock.ts`
```ts
/** Service do `@adonisjs/lock` (any de propósito — peer opt-in). */
type LockService = any

/**
 * Cria um executor single-flight: roda `fn` SÓ se conseguir o lock (de imediato,
 * sem esperar) — útil p/ garantir que apenas UMA instância execute a rotação
 * agendada. Sem `@adonisjs/lock` instalado, assume single-instance e roda `fn`
 * direto (no-lock). Mirror do padrão peer-lazy (limiter/drive).
 */
export interface SingleFlightOptions {
  key: string
  ttlMs: number
  /** Carrega o service do lock (default: import lazy de `@adonisjs/lock/services/main`). */
  loadLock?: () => Promise<LockService | null>
  /** Store do lock (db/redis); default deixa o lock service usar o default do host. */
  store?: string
}

async function defaultLoadLock(): Promise<LockService | null> {
  const spec = '@adonisjs/lock/services/main'
  return import(spec).then((m) => (m as any).default ?? null).catch(() => null)
}

export function makeSingleFlightLock(opts: SingleFlightOptions): (fn: () => Promise<void>) => Promise<void> {
  const load = opts.loadLock ?? defaultLoadLock
  return async (fn) => {
    const svc = await load()
    if (!svc) return fn() // no-lock (single-instance)
    const lock = (opts.store ? svc.use(opts.store) : svc.use()).createLock(opts.key, opts.ttlMs)
    if (!(await lock.acquireImmediately())) return // outra instância tem o lock
    try {
      await fn()
    } finally {
      await lock.release().catch(() => {})
    }
  }
}
```
NOTA: a API do `@adonisjs/lock` v2 é `lock.use(store?).createLock(key, ttlMs).acquireImmediately()` + `.release()`. Se `svc.use()` sem store não for válido na versão, ajuste para `svc.createLock(...)` direto (cheque a doc/typings). O teste injeta `loadLock`, então não exige o pacote instalado para passar.

- [ ] **Step 4: Run + commit**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="single_flight_lock.spec.ts"
npx tsc --noEmit
git add src/provider/single_flight_lock.ts packages/authkit-server/package.json tests/provider/single_flight_lock.spec.ts
git commit -m "feat(provider): single-flight lock via @adonisjs/lock (opt-in, degrade no-lock)"
```

---

## Task 5: `KeyRotationScheduler`

**Files:** Create `src/provider/key_rotation_scheduler.ts`; Test `tests/provider/key_rotation_scheduler.spec.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { test } from '@japa/runner'
import { KeyRotationScheduler } from '../../src/provider/key_rotation_scheduler.js'

function sched(over: Partial<any> = {}) {
  const calls = { rotate: 0, reload: 0 }
  const deps = {
    policy: async () => ({ enabled: true, maxAgeDays: 90, keep: 2 }),
    ageDays: async () => 100,
    rotateKeys: async () => { calls.rotate++ },
    withLock: async (fn: () => Promise<void>) => fn(),
    intervalMs: 10,
    onError: () => {},
    ...over,
  }
  return { scheduler: new KeyRotationScheduler(deps as any), calls, deps }
}

test.group('KeyRotationScheduler', () => {
  test('rotaciona quando enabled e idade ≥ maxAgeDays', async ({ assert }) => {
    const { scheduler, calls } = sched()
    await scheduler.tick()
    assert.equal(calls.rotate, 1)
  })
  test('NÃO rotaciona quando disabled', async ({ assert }) => {
    const { scheduler, calls } = sched({ policy: async () => ({ enabled: false, maxAgeDays: 90, keep: 2 }) })
    await scheduler.tick()
    assert.equal(calls.rotate, 0)
  })
  test('NÃO rotaciona quando idade < maxAgeDays', async ({ assert }) => {
    const { scheduler, calls } = sched({ ageDays: async () => 10 })
    await scheduler.tick()
    assert.equal(calls.rotate, 0)
  })
  test('re-checa idade DENTRO do lock (evita dupla rotação)', async ({ assert }) => {
    let age = 100
    const { scheduler, calls } = sched({
      ageDays: async () => age,
      withLock: async (fn: () => Promise<void>) => { age = 0; await fn() }, // outra instância rotacionou antes de pegar o lock
    })
    await scheduler.tick()
    assert.equal(calls.rotate, 0) // re-check viu idade 0 → não rotaciona de novo
  })
  test('erro vira no-op (fail-safe)', async ({ assert }) => {
    let errs = 0
    const { scheduler } = sched({ ageDays: async () => { throw new Error('x') }, onError: () => { errs++ } })
    await scheduler.tick()
    assert.equal(errs, 1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement** `src/provider/key_rotation_scheduler.ts`
```ts
/**
 * Housekeeping da lib: rotação de chave JWKS age-based. A cada intervalo, se a
 * setting `key_rotation` está enabled e a chave corrente passou de `maxAgeDays`,
 * adquire um lock single-flight (só UMA instância rotaciona) e chama `rotateKeys`,
 * que aplica ao vivo (reloadKeys). Re-checa a idade DENTRO do lock para não
 * rotacionar duas vezes quando outra instância acabou de rotacionar. Fail-safe;
 * `unref` no timer. Toda a lógica é pura+injetada (testável sem app).
 */
export interface KeyRotationSchedulerOptions {
  policy: () => Promise<{ enabled: boolean; maxAgeDays: number; keep: number }>
  ageDays: () => Promise<number | null>
  rotateKeys: (keep: number) => Promise<void>
  withLock: (fn: () => Promise<void>) => Promise<void>
  intervalMs: number
  onError?: (err: unknown) => void
}

export class KeyRotationScheduler {
  #timer: ReturnType<typeof setInterval> | undefined
  constructor(private opts: KeyRotationSchedulerOptions) {}

  async tick(): Promise<void> {
    try {
      const policy = await this.opts.policy()
      if (!policy.enabled) return
      const age = await this.opts.ageDays()
      if (age === null || age < policy.maxAgeDays) return
      await this.opts.withLock(async () => {
        // re-check dentro do lock: outra instância pode ter rotacionado.
        const age2 = await this.opts.ageDays()
        if (age2 === null || age2 < policy.maxAgeDays) return
        await this.opts.rotateKeys(policy.keep)
      })
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

- [ ] **Step 4: Run + commit**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="key_rotation_scheduler.spec.ts"
npx tsc --noEmit
git add src/provider/key_rotation_scheduler.ts tests/provider/key_rotation_scheduler.spec.ts
git commit -m "feat(provider): KeyRotationScheduler (age-based, single-flight, re-check no lock)"
```

---

## Task 6: Iniciar o scheduler no boot (`start()` hook, web-only)

**Files:** Modify `providers/authkit_server_provider.ts`

- [ ] **Step 1: Adicione `#startKeyRotationScheduler()`** e chame-o no `start()` após `await this.#startKeystoreReloadPoll()`:
```ts
async start() {
  // ...schema auto-manage existente...
  await this.#startKeystoreReloadPoll()
  await this.#startKeyRotationScheduler()
}

/**
 * Inicia o scheduler de rotação age-based (housekeeping). Só no ambiente `web`,
 * e só quando o OidcService tem keystore gerenciável (rotateKeys disponível).
 * Lê a política via SettingsCapability; single-flight via @adonisjs/lock (opt-in).
 * Fail-safe.
 */
async #startKeyRotationScheduler() {
  if (this.app.getEnvironment() !== 'web') return
  const svc: any = await this.app.container.make('authkit.server').catch(() => null)
  if (!svc || typeof svc.rotateKeys !== 'function' || typeof svc.keystoreAgeDays !== 'function') return
  // só faz sentido com keystore gerenciável:
  if ((await svc.keystoreAgeDays()) === null) return

  const logger = await this.app.container.make('logger').catch(() => null)
  const { KeyRotationScheduler } = await import('../src/provider/key_rotation_scheduler.js')
  const { makeSingleFlightLock } = await import('../src/provider/single_flight_lock.js')
  const { resolveEffectiveKeyRotation } = await import('../src/host/key_rotation.js')

  // SettingsCapability do runtime: reuse o mesmo helper que os outros settings usam.
  // (cheque como otp_lockout/session_policy obtêm o SettingsCapability em runtime —
  //  provavelmente via svc.config ou um service `authkit.settings`/getRuntimeSettings.)
  const settings = /* obter SettingsCapability — ver NOTA abaixo */ undefined as any

  const withLock = makeSingleFlightLock({ key: 'authkit:keys:rotate', ttlMs: 5 * 60_000 })
  const scheduler = new KeyRotationScheduler({
    policy: () => resolveEffectiveKeyRotation(settings),
    ageDays: () => svc.keystoreAgeDays(),
    rotateKeys: (keep: number) => svc.rotateKeys(keep),
    withLock,
    intervalMs: 60 * 60_000, // 1h (a checagem é barata; a rotação é rara)
    onError: (err) => logger?.warn({ err }, 'authkit: key rotation scheduler falhou (fail-safe)'),
  })
  scheduler.start()
}
```
**NOTA IMPORTANTE (resolver antes de implementar):** descubra como obter o `SettingsCapability` em runtime. Procure `getRuntimeSettings`, `authkit.settings`, ou como `interaction_controller`/`otp_lockout` o obtêm (ex.: `getRuntimeSettings(ctx)` usa o ctx, mas aqui não há ctx). Provavelmente há um service no container (`authkit.settings`) ou um helper `createSettingsCapability(db/config)`. Use o caminho que NÃO depende de uma request. Se a capability exigir DB e o host não tiver Lucid, `resolveEffectiveKeyRotation` já degrada para defaults (enabled:false) → scheduler vira no-op. Confirme e fie a obtenção do settings corretamente; se não houver um caminho sem-request, exponha um getter no OidcService (`svc.runtimeSettings()`), construído no provider registration onde o DB/config existem.

- [ ] **Step 2: Verify**
```bash
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts   # full suite
```

- [ ] **Step 3: Commit**
```bash
git add providers/authkit_server_provider.ts
git commit -m "feat(provider): inicia KeyRotationScheduler no boot (web-only, fail-safe)"
```

---

## Task 7: Endpoints admin `GET /keys` (status) + `POST /keys/rotate`

**Files:** Create `src/host/admin_api/api_keys_controller.ts`; Modify `src/host/register_auth_host.ts` (+ o índice de controllers `C`)

- [ ] **Step 1: READ** `src/host/admin_api/api_misc_controller.ts` (shape de controller), `admin_api_guard.ts`, e o trecho de `register_auth_host.ts` que registra as rotas admin (group + prefix + `[adminApiGuard]`) e o objeto `C` de controllers. Match o estilo.

- [ ] **Step 2: Write the controller** `src/host/admin_api/api_keys_controller.ts`
```ts
import type { HttpContext } from '@adonisjs/core/http'
import { resolveEffectiveKeyRotation } from '../key_rotation.js'

/** Erro JSON no formato da admin API (reuse o helper existente — ver api_misc_controller). */
function apiError(code: string, message: string) { return { error: { code, message } } }

export default class ApiKeysController {
  /** GET /keys — status da chave de assinatura managed. */
  async status(ctx: HttpContext) {
    const svc: any = await ctx.containerResolver.make('authkit.server')
    if (typeof svc.keystoreAgeDays !== 'function') {
      return ctx.response.status(501).send(apiError('not_implemented', 'jwks não é managed+store.'))
    }
    const ageDays = await svc.keystoreAgeDays()
    if (ageDays === null) {
      return ctx.response.status(501).send(apiError('not_implemented', 'jwks não é managed+store (ou keystore encriptado sem APP_KEY).'))
    }
    // política efetiva (p/ next ETA) — obtenha o SettingsCapability como o scheduler (Task 6).
    const settings = /* mesmo caminho da Task 6 */ undefined as any
    const policy = settings ? await resolveEffectiveKeyRotation(settings) : { enabled: false, maxAgeDays: 90, keep: 2 }
    const nextInDays = policy.enabled ? Math.max(0, policy.maxAgeDays - ageDays) : null
    return { ageDays, policy, nextRotationInDays: nextInDays }
  }

  /** POST /keys/rotate — { retire?: boolean }. Rotaciona AGORA e aplica ao vivo. */
  async rotate(ctx: HttpContext) {
    const svc: any = await ctx.containerResolver.make('authkit.server')
    if (typeof svc.rotateKeys !== 'function' || (await svc.keystoreAgeDays?.()) === null) {
      return ctx.response.status(501).send(apiError('not_implemented', 'rotação indisponível (jwks não é managed+store).'))
    }
    const body = ctx.request.body() as { retire?: boolean; keep?: number }
    const retire = body?.retire === true
    const keep = typeof body?.keep === 'number' && body.keep >= 1 ? Math.floor(body.keep) : 2
    const result = await svc.rotateKeys(keep, retire)
    return { rotated: true, ...result }
  }
}
```
NOTA: reuse o helper `apiError` REAL do módulo admin (provavelmente exportado de um `api_errors.ts` ou similar — procure onde `api_misc_controller` importa `apiError`). NÃO redefina se já existe. Resolva o `SettingsCapability` pelo mesmo caminho da Task 6 (idealmente um getter `svc.runtimeSettings()`).

- [ ] **Step 3: Register routes** em `src/host/register_auth_host.ts`, no grupo admin API (junto de `/settings`, `/audit`, etc.):
```ts
withApiThrottle(router.get('/keys', [C.apiKeys, 'status']))
withApiThrottle(router.post('/keys/rotate', [C.apiKeys, 'rotate']))
```
E adicione `apiKeys: ApiKeysController` (ou o import lazy) ao objeto `C` de controllers, seguindo como os outros controllers admin são referenciados ali.

- [ ] **Step 4: Write a test** (`tests/host/admin_api/api_keys.spec.ts` — ou onde os specs de admin_api vivem; procure `api_settings`/`admin_api.spec.ts` p/ o padrão de boot do host + auth bearer). O teste deve: subir o host com admin API + uma chave; `GET /api/authkit/v1/keys` → 200 com `ageDays` numérico; `POST /api/authkit/v1/keys/rotate` → 200 `rotated:true` e o `GET` seguinte mostra mais chaves / kid novo. Reuse o helper de bootstrap de host dos specs admin existentes.

- [ ] **Step 5: Run + commit**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="api_keys.spec.ts"
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts   # full suite
git add src/host/admin_api/api_keys_controller.ts src/host/register_auth_host.ts tests/host/admin_api/api_keys.spec.ts
git commit -m "feat(admin): GET /keys (status) + POST /keys/rotate (rotaciona ao vivo)"
```

---

## Task 7b: Console JSON API `GET {ap}/api/keys` + `POST {ap}/api/keys/rotate` (sessão+role)

O browser/React (Fatia D2) NÃO pode usar a API key. Espelha a Task 7 num controller de console autenticado por sessão+role admin (`adminGuard`) — exatamente como `console_settings_controller` espelha `api_settings_controller`.

**Files:** Create `src/host/admin_console/console_keys_controller.ts`; Modify `src/host/register_auth_host.ts`; Test `tests/host/admin_console/console_keys.spec.ts`

- [ ] **Step 1: READ** `src/host/admin_console/console_settings_controller.ts` (o padrão de controller de console: `getSettingsService(ctx)`, `notSupported`, `resolveOrgId`, retorno DTO) e o grupo de rotas do console em `register_auth_host.ts` (`.group(() => { ... router.get(\`${ap}/api/settings\`, ...) }).use([adminGuard])`).

- [ ] **Step 2: Write the controller** `src/host/admin_console/console_keys_controller.ts` — MESMA lógica do `api_keys_controller` (status/rotate via `svc.keystoreAgeDays()`/`svc.rotateKeys()` + `resolveEffectiveKeyRotation` p/ a política), mas no estilo dos controllers de console (erros via os helpers do console, `resolveOrgId` se aplicável — política de rotação é global, então provavelmente sem org scope). Reutilize a lógica: considere extrair um helper compartilhado `buildKeysStatus(svc, settings)` e `rotateNow(svc, body)` em um módulo (`src/host/key_rotation_actions.ts`) que AMBOS os controllers (REST da Task 7 + console) chamam, p/ não duplicar. (Se extrair, ajuste a Task 7 p/ usar o helper também — faça no review/refactor.)
  - `status(ctx)`: 200 `{ ageDays, policy, nextRotationInDays }` ou 501 se não-managed.
  - `rotate(ctx)`: body `{ retire?, keep? }` → `svc.rotateKeys(keep, retire)` → 200 `{ rotated:true, ...result }`. Audit `keys.rotated` já é feito dentro de `rotateKeys`.

- [ ] **Step 3: Register console routes** no grupo `adminGuard` de `register_auth_host.ts` (junto de `${ap}/api/settings`):
```ts
router.get(`${ap}/api/keys`, [C.consoleKeys, 'status'])
router.post(`${ap}/api/keys/rotate`, [C.consoleKeys, 'rotate'])
```
Registrar `consoleKeys` no objeto `C`.

- [ ] **Step 4: Test + commit** — `tests/host/admin_console/console_keys.spec.ts`: subir o host com admin console + uma sessão admin (reuse o helper de bootstrap dos specs `admin_console.spec.ts`/`admin_settings.spec.ts`), `GET {ap}/api/keys` → 200 com `ageDays`; `POST {ap}/api/keys/rotate` → `rotated:true`. Verifique que SEM sessão admin → redirect/403 (o `adminGuard` já cobre).
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="console_keys.spec.ts"
npx tsc --noEmit && node --import=@poppinss/ts-exec bin/test.ts
git add src/host/admin_console/console_keys_controller.ts src/host/register_auth_host.ts tests/host/admin_console/console_keys.spec.ts src/host/key_rotation_actions.ts
git commit -m "feat(console): GET/POST {ap}/api/keys (session-authed) p/ o admin console"
```

---

## Task 7c: Métodos `keys.*` no `authkit-sdk` (backend SDK, Admin REST API)

O `authkit-sdk` (remote + embedded drivers) ganha `authkit.keys.status()` / `authkit.keys.rotate({retire?,keep?})`, batendo na Admin REST API (`/api/authkit/v1/keys`) com Bearer key. Para backends/automação (≠ browser).

**Files:** Modify `packages/authkit-sdk/src/*` (drivers + index); Test no `authkit-sdk`

- [ ] **Step 1: READ** como o `authkit-sdk` expõe um recurso admin existente (ex.: `settings` ou `clients`) — o `remote_driver.ts` (request com Bearer) e o `embedded_driver.ts` (in-process), e como `index.ts`/o tipo do client agrega os recursos. Mirror um recurso simples (ex.: `audit()`/`stats()`).

- [ ] **Step 2: Add `keys` resource** — `status(): Promise<KeysStatus>` → `GET /keys`; `rotate(input?: { retire?: boolean; keep?: number }): Promise<KeysRotateResult>` → `POST /keys/rotate`. No remote driver via `request('GET','/keys')`/`request('POST','/keys/rotate', input)`; no embedded driver chamando o mesmo serviço in-process (ou o controller). Tipar `KeysStatus`/`KeysRotateResult` (em `authkit-core` se compartilhado, ou no sdk).

- [ ] **Step 3: Test + commit** — espelhe um teste de recurso existente do sdk (remote com fetch fake; embedded se aplicável).
```bash
# rodar a suíte do authkit-sdk (cheque o package.json do sdk p/ o comando de teste)
git add packages/authkit-sdk
git commit -m "feat(sdk): recurso keys (status + rotate) na Admin REST API"
```

---

## Task 8: Verificação final + changeset + review

- [ ] **Step 1: Suíte + tsc (server + core)**
```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts && npx tsc --noEmit
cd ../authkit-core && npm run build && npx tsc --noEmit && cd ../authkit-server
```

- [ ] **Step 2: Changeset**
```bash
cat > ../../.changeset/keystore-v2-fatia-d1.md <<'EOF'
---
'@dudousxd/adonis-authkit-server': minor
---

feat: rotação automática de chaves JWKS (age-based) + endpoints admin. Nova setting
`key_rotation` ({enabled,maxAgeDays,keep}, default OFF); um scheduler de housekeeping
rotaciona a chave quando ela passa de `maxAgeDays` e aplica ao vivo (sem restart),
com single-flight via `@adonisjs/lock` (opt-in; sem ele assume single-instance).
Novos endpoints admin: `GET /keys` (status: idade, política, próxima rotação) e
`POST /keys/rotate` ({retire?}) para rotacionar agora. `@adonisjs/lock` é peer opcional.
EOF
git add ../../.changeset/keystore-v2-fatia-d1.md
git commit -m "chore: changeset p/ Keystore v2 Fatia D1 (rotação agendada + endpoints)"
```

- [ ] **Step 3: Final review** (dispatch reviewer): confirmar (a) scheduler fail-safe + re-check no lock + web-only; (b) single-flight degrade sem o pacote; (c) `rotateKeys` audita e aplica via reloadKeys serializado; (d) endpoints guardados pelo adminApiGuard + 501 quando não-managed; (e) setting default OFF (rotação automática é opt-in).

---

## Notas / follow-up

### Fatia D2 — React SDK + admin console UI (plano separado, depende de D1)
Aterrado no que já existe em `authkit-react` (TanStack Query JÁ é peer; padrão estabelecido):
- **`AuthkitClient` tipado** (`packages/authkit-react/src/client/client.ts`): adicionar `client.admin.keys.status()` e `client.admin.keys.rotate(input?)` — batem na **console JSON API** (`{adminBase}/api/keys`, session-authed via `credentials:'include'` + CSRF), mirror de `client.admin.users.*`. **Nunca** a Bearer key.
- **Query keys** (`packages/authkit-react/src/queries/keys.ts`): adicionar `authkitKeys.admin.keys()`.
- **Headless (TanStack), padrão options-object** (`src/queries/admin/index.ts`):
  - `useKeysQueryOptions()` → `{ queryKey: authkitKeys.admin.keys(), queryFn: () => client.admin.keys.status() } satisfies UseQueryOptions<...>`.
  - `useRotateKeysMutationOptions()` → `{ mutationKey, mutationFn: (input) => client.admin.keys.rotate(input) } satisfies UseMutationOptions<...>`. (Consumidor faz `useQuery`/`useMutation` + `invalidateQueries(authkitKeys.admin.keys())` no sucesso.)
- **Componente** (`src/components/`, estilo `createElement` + classes BEM `authkit-*`, gating por `idp`): `<KeyRotation>` — mostra idade da chave, política (next ETA), botão "Rotacionar agora" (+ confirmação), opção "Aposentar antigas". Usa os hooks headless acima.
- **Política via settings genérico:** salvar `key_rotation` (enabled/maxAgeDays/keep) usa o `PUT {ap}/api/settings/:key` que já existe — um form no painel, sem endpoint novo.
- **Auth:** tudo session-authed (`adminGuard`); zero API key no browser.

### Integração delicada (validar no review da D1)
- **SettingsCapability sem request:** o scheduler (Task 6) e os endpoints (7/7b) precisam do `SettingsCapability` fora de uma request — resolver via um getter no `OidcService` construído no provider registration (onde DB/config existem). Ponto mais delicado da fatia.
- **Cache do manager:** `keystoreManager()` reconstrói o manager a cada chamada. Cheap p/ file/drive; com cofres de cloud, cachear (anotado na Fatia C).
- **DRY REST vs console:** extrair `key_rotation_actions.ts` (status/rotate) compartilhado entre o controller REST (Task 7) e o de console (Task 7b).
