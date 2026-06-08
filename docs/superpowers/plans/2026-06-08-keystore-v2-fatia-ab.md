# Keystore v2 — Fatia A + B-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o keystore JWKS managed de `fs`-síncrono-num-`path` para uma abstração de cofre pluggável (`file`/`drive`) com encryption at-rest backend-aware, mais o boot warning e a idade da chave no doctor.

**Architecture:** Três peças novas em `packages/authkit-server/src/keys/`: a interface `KeystoreVault` (read/write/head do blob), o `KeystoreCodec` (serializa + encripta com envelope versionado + lê plaintext legado) e o `KeystoreManager` (orquestra vault+codec: ensure/read/rotate/head). O boot (`define_config`) e o comando `authkit:keys:rotate` passam a usar o manager. As helpers puras (`generateSigningJwk`, `planRotation`, `signingKeyAgeDays`, `toPublicJwks`) ficam em `keystore.ts`.

**Tech Stack:** TypeScript (ESM, NodeNext), `jose`, `@adonisjs/core/services/encryption` (APP_KEY), `@adonisjs/drive` (peer opt-in), Japa (`@japa/runner`).

**Escopo desta fatia:** entrega a interface `KeystoreVault` + codec + manager + vaults `file` e `drive` + config + wiring + boot warning + doctor age. Os cofres de cloud (`hashicorp/aws/gcp/azure`) ficam em planos-irmãos (cada um implementa a interface estável entregue aqui); o resolver de driver lança erro claro se um driver de cloud for selecionado nesta fatia.

**Comandos de teste (deste package):**
```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts --files="<arquivo>.spec.ts"   # um arquivo
npx tsc --noEmit                                                          # typecheck
```

---

## File Structure

**Criar:**
- `src/keys/keystore_vault.ts` — interface `KeystoreVault` + `FileKeystoreVault` + `DriveKeystoreVault` + `loadDrive` local.
- `src/keys/keystore_codec.ts` — `KeystoreCodec` (envelope `{v,enc,data}`, encrypt/decrypt), `EncryptionLike`. (0.x: sem camada de legado/migração.)
- `src/keys/keystore_crypto.ts` — `loadEncryptionService()` (await + throw) + reset p/ testes.
- `src/keys/keystore_manager.ts` — `KeystoreManager` (ensure/read/rotate/plan/head) + `resolveKeystoreVault`.
- `tests/keys/keystore_codec.spec.ts`, `tests/keys/keystore_vault.spec.ts`, `tests/keys/keystore_manager.spec.ts`.

**Modificar:**
- `packages/authkit-core/src/types/server_config.ts:32-47` — widen `JwksConfig.store` + add `encrypt`.
- `src/keys/keystore.ts` — manter as 4 helpers puras; o manager passa a ser o caminho de I/O (as fns sync antigas continuam por ora, mas o boot/comando deixam de chamá-las).
- `src/define_config.ts:950-975` — boot warning (Fatia A) + wiring do manager no caminho managed+store.
- `commands/keys_rotate.ts` — usar `KeystoreManager` em vez de `rotateKeystore/readKeystore` direto.
- `src/doctor/checks.ts` + `commands/doctor.ts` — finding de idade da chave (Fatia A).

---

## Task 1: Boot warning no fallback `auto → disco` (Fatia A)

**Files:**
- Modify: `src/define_config.ts:950-957`
- Test: `tests/keys/define_config_jwks.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/keys/define_config_jwks.spec.ts
import { test } from '@japa/runner'
import { jwksAutoFallbackWarning } from '../../src/define_config.js'

test.group('jwks auto fallback warning', () => {
  test('warns quando auto cai no fallback de disco (sem AUTHKIT_JWKS)', ({ assert }) => {
    assert.isString(jwksAutoFallbackWarning('tmp/authkit_jwks.json'))
    assert.match(jwksAutoFallbackWarning('tmp/x.json')!, /AUTHKIT_JWKS|disco/i)
  })

  test('não warna quando não é o caso de fallback', ({ assert }) => {
    assert.isNull(jwksAutoFallbackWarning(null))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="define_config_jwks.spec.ts"`
Expected: FAIL — `jwksAutoFallbackWarning is not a function`.

- [ ] **Step 3: Add the pure helper + emit it in the resolver**

Em `src/define_config.ts`, adicione a função pura (perto de `toSeconds`):

```ts
/**
 * Mensagem de aviso quando `jwks: 'auto'` cai no fallback de disco (sem
 * AUTHKIT_JWKS): a chave privada será persistida em arquivo. `null` = sem aviso.
 */
export function jwksAutoFallbackWarning(storePath: string | null): string | null {
  if (!storePath) return null
  return (
    `AuthKit: jwks 'auto' caiu no fallback de disco (${storePath}) — a chave privada de ` +
    `assinatura será persistida em arquivo. Para produção, defina AUTHKIT_JWKS ` +
    `(secret manager) ou configure jwks.store explicitamente.`
  )
}
```

No resolver, no ramo `config.jwks === 'auto'` sem `AUTHKIT_JWKS`, emita o aviso pelo logger do app (lazy, fail-safe):

```ts
const jwksConfig: JwksConfig =
  config.jwks === 'auto'
    ? process.env.AUTHKIT_JWKS
      ? { source: 'jwks', keys: JSON.parse(process.env.AUTHKIT_JWKS).keys }
      : { source: 'managed', algorithm: 'RS256', store: 'tmp/authkit_jwks.json' }
    : config.jwks

if (config.jwks === 'auto' && !process.env.AUTHKIT_JWKS) {
  const warning = jwksAutoFallbackWarning((jwksConfig as { store?: string }).store ?? null)
  if (warning) {
    await app.container
      .make('logger')
      .then((l: any) => l?.warn(warning))
      .catch(() => {})
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="define_config_jwks.spec.ts"`
Expected: PASS (2 passed).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/define_config.ts tests/keys/define_config_jwks.spec.ts
git commit -m "feat(keys): warn quando jwks 'auto' cai no fallback de disco"
```

---

## Task 2: `KeystoreCodec` — envelope plaintext + leitura de legado

**Files:**
- Create: `src/keys/keystore_codec.ts`
- Test: `tests/keys/keystore_codec.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/keys/keystore_codec.spec.ts
import { test } from '@japa/runner'
import { KeystoreCodec, isLegacyBlob } from '../../src/keys/keystore_codec.js'

const STORE = { keys: [{ kid: 'k1', kty: 'RSA', d: 'secret', use: 'sig' }] }

test.group('KeystoreCodec (plaintext)', () => {
  test('round-trip plaintext via envelope v2/none', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const blob = await codec.encode(STORE as any)
    assert.deepEqual(JSON.parse(blob).enc, 'none')
    assert.deepEqual(await codec.decode(blob), STORE)
  })

  test('decode lê keystore legado (JSON cru sem envelope)', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const legacy = JSON.stringify(STORE)
    assert.isTrue(isLegacyBlob(legacy))
    assert.deepEqual(await codec.decode(legacy), STORE)
  })

  test('decode lança em formato irreconhecível', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    await assert.rejects(() => codec.decode('{"v":2,"enc":"weird","data":"x"}'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_codec.spec.ts"`
Expected: FAIL — módulo `keystore_codec.js` não existe.

- [ ] **Step 3: Implement the codec (sem encryption ainda)**

```ts
// src/keys/keystore_codec.ts
import type { PersistedKeystore } from './keystore.js'

/** Subconjunto do serviço de encryption do AdonisJS (APP_KEY). */
export interface EncryptionLike {
  encrypt(value: string): string
  decrypt<T = string>(value: string): T | null
}

/** Envelope versionado persistido no cofre. */
interface Envelope {
  v: 2
  enc: 'none' | 'aes'
  data: string
}

/** `true` se o blob é um keystore legado (JSON cru `{keys:[...]}` sem envelope). */
export function isLegacyBlob(blob: string): boolean {
  try {
    const p = JSON.parse(blob)
    return !!p && Array.isArray(p.keys) && p.v === undefined
  } catch {
    return false
  }
}

/**
 * Serializa/desserializa o keystore com envelope versionado. `encrypt: true`
 * exige um `enc` (EncryptionLike). `decode` aceita: legado (JSON cru),
 * `enc:'none'` e `enc:'aes'`. Decrypt falho → THROW (decisão: nunca regenerar).
 */
export class KeystoreCodec {
  constructor(private opts: { encrypt: boolean; enc?: EncryptionLike }) {}

  async encode(store: PersistedKeystore): Promise<string> {
    const json = JSON.stringify(store)
    if (this.opts.encrypt) {
      if (!this.opts.enc) {
        throw new Error('AuthKit keystore: encryption pedida mas serviço de encryption indisponível.')
      }
      const env: Envelope = { v: 2, enc: 'aes', data: this.opts.enc.encrypt(json) }
      return JSON.stringify(env)
    }
    const env: Envelope = { v: 2, enc: 'none', data: json }
    return JSON.stringify(env)
  }

  async decode(blob: string): Promise<PersistedKeystore> {
    const parsed = JSON.parse(blob)
    // Legado: JSON cru sem envelope.
    if (parsed && Array.isArray(parsed.keys) && parsed.v === undefined) {
      return parsed as PersistedKeystore
    }
    if (parsed?.v === 2 && typeof parsed.data === 'string') {
      if (parsed.enc === 'none') return JSON.parse(parsed.data)
      if (parsed.enc === 'aes') {
        if (!this.opts.enc) {
          throw new Error('AuthKit keystore: blob encriptado mas serviço de encryption indisponível.')
        }
        const json = this.opts.enc.decrypt<string>(parsed.data)
        if (json == null) {
          throw new Error(
            'AuthKit keystore: decrypt falhou — APP_KEY mudou? Restaure a APP_KEY anterior ' +
              'ou regenere com `authkit:keys:rotate --force-new`.'
          )
        }
        return JSON.parse(json)
      }
    }
    throw new Error('AuthKit keystore: formato de blob irreconhecível.')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_codec.spec.ts"`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/keys/keystore_codec.ts tests/keys/keystore_codec.spec.ts
git commit -m "feat(keys): KeystoreCodec com envelope versionado + leitura de legado"
```

---

## Task 3: `KeystoreCodec` — encryption + decrypt-fail lança

**Files:**
- Modify: `tests/keys/keystore_codec.spec.ts`
- (a implementação já suporta `enc`; este task cobre o caminho encriptado por teste)

- [ ] **Step 1: Write the failing test (append no mesmo arquivo)**

```ts
// fake reversível (não-cripto, só p/ teste): base64
const fakeEnc = {
  encrypt: (v: string) => Buffer.from(v, 'utf8').toString('base64'),
  decrypt: <T = string>(v: string) => Buffer.from(v, 'base64').toString('utf8') as unknown as T,
}

test.group('KeystoreCodec (encrypted)', () => {
  test('round-trip encriptado via envelope v2/aes', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: true, enc: fakeEnc })
    const blob = await codec.encode(STORE as any)
    const env = JSON.parse(blob)
    assert.equal(env.enc, 'aes')
    assert.notInclude(env.data, 'secret') // a privada não aparece em claro
    assert.deepEqual(await codec.decode(blob), STORE)
  })

  test('decrypt que retorna null lança (nunca regenera)', async ({ assert }) => {
    const failing = { encrypt: fakeEnc.encrypt, decrypt: () => null }
    const codec = new KeystoreCodec({ encrypt: true, enc: failing })
    const blob = await new KeystoreCodec({ encrypt: true, enc: fakeEnc }).encode(STORE as any)
    await assert.rejects(() => codec.decode(blob), /decrypt falhou/)
  })

  test('encrypt:true sem serviço lança no encode', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: true })
    await assert.rejects(() => codec.encode(STORE as any), /indisponível/)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (impl já existe do Task 2)**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_codec.spec.ts"`
Expected: PASS (6 passed no total). Se algo falhar, ajuste a impl do Task 2 — não adicione código novo aqui além do que o teste exige.

- [ ] **Step 3: Commit**

```bash
git add tests/keys/keystore_codec.spec.ts
git commit -m "test(keys): cobre caminho encriptado e decrypt-fail do KeystoreCodec"
```

---

## Task 4: `loadEncryptionService` (APP_KEY, await + throw)

**Files:**
- Create: `src/keys/keystore_crypto.ts`
- Test: `tests/keys/keystore_crypto.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/keys/keystore_crypto.spec.ts
import { test } from '@japa/runner'
import { __setEncryptionServiceForTests, getInjectedEncryptionService } from '../../src/keys/keystore_crypto.js'

test.group('keystore crypto', (group) => {
  group.each.teardown(() => __setEncryptionServiceForTests(undefined))

  test('serviço injetado é retornado (sem app)', ({ assert }) => {
    const fake = { encrypt: (v: string) => v, decrypt: <T = string>(v: string) => v as unknown as T }
    __setEncryptionServiceForTests(fake)
    assert.strictEqual(getInjectedEncryptionService(), fake)
  })

  test('sem injeção, getInjected retorna undefined', ({ assert }) => {
    assert.isUndefined(getInjectedEncryptionService())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_crypto.spec.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// src/keys/keystore_crypto.ts
import type { EncryptionLike } from './keystore_codec.js'

/**
 * Carrega o serviço de encryption do app (APP_KEY) de forma LAZY. Diferente do
 * encrypter do TOTP (que degrada p/ plaintext), aqui o caller decide o que fazer
 * com a ausência — o keystore exige determinismo. Em testes, injete via
 * {@link __setEncryptionServiceForTests}.
 */
let injected: EncryptionLike | undefined

export function __setEncryptionServiceForTests(svc: EncryptionLike | undefined): void {
  injected = svc
}

/** Retorna o serviço injetado (testes) ou undefined. */
export function getInjectedEncryptionService(): EncryptionLike | undefined {
  return injected
}

/**
 * Resolve o serviço de encryption: injeção (testes) tem prioridade; senão importa
 * `@adonisjs/core/services/encryption`. Lança se nenhum estiver disponível.
 */
export async function loadEncryptionService(): Promise<EncryptionLike> {
  if (injected) return injected
  const mod = await import('@adonisjs/core/services/encryption')
  const svc = (mod as { default?: EncryptionLike }).default
  if (!svc) throw new Error('AuthKit keystore: serviço de encryption (APP_KEY) indisponível.')
  return svc
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_crypto.spec.ts"`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/keys/keystore_crypto.ts tests/keys/keystore_crypto.spec.ts
git commit -m "feat(keys): loadEncryptionService (APP_KEY, lazy, injetável p/ testes)"
```

---

## Task 5: `FileKeystoreVault` + interface `KeystoreVault`

**Files:**
- Create: `src/keys/keystore_vault.ts`
- Test: `tests/keys/keystore_vault.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/keys/keystore_vault.spec.ts
import { test } from '@japa/runner'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'

test.group('FileKeystoreVault', (group) => {
  let dir: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-vault-')) })
  group.each.teardown(() => rmSync(dir, { recursive: true, force: true }))

  test('read de arquivo ausente → null', async ({ assert }) => {
    const v = new FileKeystoreVault(join(dir, 'nope.json'))
    assert.isNull(await v.read())
  })

  test('write + read round-trip, mode 0600', async ({ assert }) => {
    const path = join(dir, 'jwks.json')
    const v = new FileKeystoreVault(path)
    await v.write('hello-blob')
    assert.equal(await v.read(), 'hello-blob')
    assert.equal(statSync(path).mode & 0o777, 0o600)
  })

  test('head muda após write', async ({ assert }) => {
    const path = join(dir, 'jwks.json')
    const v = new FileKeystoreVault(path)
    assert.isNull(await v.head())
    await v.write('x')
    assert.isString(await v.head())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_vault.spec.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement interface + FileKeystoreVault + loadDrive + DriveKeystoreVault**

```ts
// src/keys/keystore_vault.ts
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Cofre onde o keystore (blob, possivelmente encriptado) é persistido. Ponto de
 * extensão: cofres custom implementam esta interface. `head` é um token barato de
 * detecção de mudança (mtime/etag/versão) p/ o poll de reload (Fatia C).
 */
export interface KeystoreVault {
  read(): Promise<string | null>
  write(blob: string): Promise<void>
  head?(): Promise<string | null>
}

/** Cofre em arquivo local (default; mode 0600). */
export class FileKeystoreVault implements KeystoreVault {
  constructor(private path: string) {}

  async read(): Promise<string | null> {
    return existsSync(this.path) ? readFileSync(this.path, 'utf-8') : null
  }

  async write(blob: string): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, blob.endsWith('\n') ? blob : blob + '\n', { mode: 0o600 })
  }

  async head(): Promise<string | null> {
    return existsSync(this.path) ? String(statSync(this.path).mtimeMs) : null
  }
}

/** Service do `@adonisjs/drive` resolvido lazy (peer opt-in; mesmo padrão do avatar). */
type DriveService = any
let driveServicePromise: Promise<DriveService | null> | undefined

async function loadDrive(): Promise<DriveService | null> {
  if (!driveServicePromise) {
    const specifier = '@adonisjs/drive/services/main'
    driveServicePromise = import(specifier)
      .then((m) => (m as any).default ?? null)
      .catch(() => null)
  }
  return driveServicePromise
}

/** Reaponta o loader do drive (testes). @internal */
export function __setKeystoreDriveLoaderForTests(fn: (() => Promise<DriveService | null>) | undefined): void {
  driveServicePromise = fn ? fn() : undefined
}

/**
 * Cofre num disk do `@adonisjs/drive` (S3/GCS/local). Diferente do avatar, chave é
 * crítica: se o drive não está instalado mas foi selecionado → ERRO (não degrada).
 */
export class DriveKeystoreVault implements KeystoreVault {
  constructor(
    private key: string,
    private diskName?: string
  ) {}

  private async disk(): Promise<any> {
    const drive = await loadDrive()
    if (!drive) {
      throw new Error('AuthKit keystore: driver "drive" selecionado mas @adonisjs/drive não está instalado.')
    }
    return this.diskName ? drive.use(this.diskName) : drive
  }

  async read(): Promise<string | null> {
    const disk = await this.disk()
    if (!(await disk.exists(this.key))) return null
    return disk.get(this.key)
  }

  async write(blob: string): Promise<void> {
    const disk = await this.disk()
    await disk.put(this.key, blob)
  }

  async head(): Promise<string | null> {
    const disk = await this.disk()
    try {
      const meta = await disk.getMetaData(this.key)
      return meta?.etag ?? (meta?.lastModified ? String(new Date(meta.lastModified).getTime()) : null)
    } catch {
      return null
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_vault.spec.ts"`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/keys/keystore_vault.ts tests/keys/keystore_vault.spec.ts
git commit -m "feat(keys): KeystoreVault + FileKeystoreVault + DriveKeystoreVault"
```

---

## Task 6: `DriveKeystoreVault` — teste com drive fakeado

**Files:**
- Modify: `tests/keys/keystore_vault.spec.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
import { DriveKeystoreVault, __setKeystoreDriveLoaderForTests } from '../../src/keys/keystore_vault.js'

test.group('DriveKeystoreVault', (group) => {
  group.each.teardown(() => __setKeystoreDriveLoaderForTests(undefined))

  test('read/write/head usando um disk fake', async ({ assert }) => {
    const files = new Map<string, string>()
    const fakeDisk = {
      exists: async (k: string) => files.has(k),
      get: async (k: string) => files.get(k)!,
      put: async (k: string, v: string) => void files.set(k, v),
      getMetaData: async () => ({ etag: 'etag-' + files.size }),
    }
    __setKeystoreDriveLoaderForTests(async () => ({ use: () => fakeDisk, ...fakeDisk }))

    const v = new DriveKeystoreVault('keys/jwks.json')
    assert.isNull(await v.read())
    await v.write('blob-1')
    assert.equal(await v.read(), 'blob-1')
    assert.isString(await v.head())
  })

  test('drive ausente + driver selecionado → erro alto', async ({ assert }) => {
    __setKeystoreDriveLoaderForTests(async () => null)
    const v = new DriveKeystoreVault('keys/jwks.json')
    await assert.rejects(() => v.read(), /@adonisjs\/drive não está instalado/)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_vault.spec.ts"`
Expected: PASS (5 passed no total). Ajuste a impl do Task 5 só se necessário p/ o teste passar.

- [ ] **Step 3: Commit**

```bash
git add tests/keys/keystore_vault.spec.ts
git commit -m "test(keys): DriveKeystoreVault com disk fakeado + erro se drive ausente"
```

---

## Task 7: `KeystoreManager` — ensure/read/rotate/head + upgrade de legado

**Files:**
- Create: `src/keys/keystore_manager.ts`
- Test: `tests/keys/keystore_manager.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/keys/keystore_manager.spec.ts
import { test } from '@japa/runner'
import { KeystoreManager } from '../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../src/keys/keystore_codec.js'
import type { KeystoreVault } from '../../src/keys/keystore_vault.js'

function memVault(initial: string | null = null): KeystoreVault & { blob: string | null } {
  return {
    blob: initial,
    async read() { return this.blob },
    async write(b: string) { this.blob = b },
    async head() { return this.blob ? String(this.blob.length) : null },
  }
}

test.group('KeystoreManager', () => {
  test('ensure gera + persiste quando ausente', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    const store = await mgr.ensure()
    assert.lengthOf(store.keys, 1)
    assert.isString(store.keys[0].kid)
    assert.isNotNull(vault.blob) // persistiu
  })

  test('ensure existente decodifica e retorna sem reescrever', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const existing = await codec.encode({ keys: [{ kid: 'old', kty: 'RSA', d: 'x', alg: 'RS256' }] } as any)
    const vault = memVault(existing)
    const mgr = new KeystoreManager(vault, codec, 'RS256')
    const store = await mgr.ensure()
    assert.equal(store.keys[0].kid, 'old')          // preserva a chave existente
    assert.equal(vault.blob, existing)              // não reescreveu
  })

  test('rotate gera kid novo na frente e mantém keep', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    await mgr.ensure()
    const firstKid = (await mgr.read())!.keys[0].kid
    const res = await mgr.rotate(2, false)
    assert.notEqual(res.newKid, firstKid)
    const after = (await mgr.read())!
    assert.equal(after.keys[0].kid, res.newKid)      // novo assina
    assert.equal(after.keys[1].kid, firstKid)        // antigo no grace
  })

  test('head delega ao vault', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    assert.isNull(await mgr.head())
    await mgr.ensure()
    assert.isString(await mgr.head())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implement**

```ts
// src/keys/keystore_manager.ts
import { generateSigningJwk, planRotation, type PersistedKeystore, type RotationPlan } from './keystore.js'
import type { KeystoreCodec } from './keystore_codec.js'
import type { KeystoreVault } from './keystore_vault.js'
import type { SigningAlg } from './jwks_manager.js'

/**
 * Único caminho de I/O do keystore managed: compõe um {@link KeystoreVault} (onde
 * o blob mora) com um {@link KeystoreCodec} (serialização + encryption). As helpers
 * puras (gerar chave, planejar rotação) continuam em `keystore.ts`.
 */
export class KeystoreManager {
  constructor(
    private vault: KeystoreVault,
    private codec: KeystoreCodec,
    private alg: SigningAlg
  ) {}

  /** Lê o keystore (privado) ou null se ausente. */
  async read(): Promise<PersistedKeystore | null> {
    const blob = await this.vault.read()
    if (blob == null) return null
    return this.codec.decode(blob)
  }

  /** Garante que exista: gera+persiste se ausente; senão decodifica e retorna. */
  async ensure(): Promise<PersistedKeystore> {
    const blob = await this.vault.read()
    if (blob == null) {
      const store: PersistedKeystore = { keys: [await generateSigningJwk(this.alg)] }
      await this.vault.write(await this.codec.encode(store))
      return store
    }
    return this.codec.decode(blob)
  }

  /** Rotaciona: chave nova na frente, mantém as `keep` mais recentes. Persiste. */
  async rotate(
    keep = 2,
    retire = false
  ): Promise<{ store: PersistedKeystore; newKid: string; retiredKids: string[] }> {
    const current = (await this.read()) ?? { keys: [] }
    const fresh = await generateSigningJwk(this.alg)
    const next = [fresh, ...current.keys]
    const effectiveKeep = retire ? 1 : Math.max(1, keep)
    const kept = next.slice(0, effectiveKeep)
    const retiredKids = next.slice(effectiveKeep).map((k) => k.kid as string)
    const store: PersistedKeystore = { keys: kept }
    await this.vault.write(await this.codec.encode(store))
    return { store, newKid: fresh.kid as string, retiredKids }
  }

  /** Plano de rotação (puro, sem I/O de escrita). */
  async plan(keep: number, retire: boolean): Promise<RotationPlan> {
    return planRotation(await this.read(), keep, retire)
  }

  /** Token barato de mudança (delegado ao vault; fallback p/ read completo). */
  async head(): Promise<string | null> {
    if (this.vault.head) return this.vault.head()
    return this.vault.read()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/keys/keystore_manager.ts tests/keys/keystore_manager.spec.ts
git commit -m "feat(keys): KeystoreManager (ensure/read/rotate/head + upgrade de legado)"
```

---

## Task 8: `resolveKeystoreVault` + `JwksConfig.store` widened + `encrypt`

**Files:**
- Modify: `packages/authkit-core/src/types/server_config.ts:32-47`
- Modify: `src/keys/keystore_manager.ts` (adiciona o resolver)
- Test: `tests/keys/keystore_manager.spec.ts` (append)

- [ ] **Step 1: Widen the config type**

Em `packages/authkit-core/src/types/server_config.ts`, substitua `store?: string` (e adicione `encrypt`) no `JwksConfig`:

```ts
/** Config de onde o keystore managed mora. String = atalho p/ { driver:'file', path }. */
export type KeystoreStoreConfig =
  | string
  | { driver: 'file'; path: string }
  | { driver: 'drive'; disk?: string; key: string }
  | { driver: 'hashicorp-vault'; endpoint: string; path: string; token?: string }
  | { driver: 'aws-secrets-manager'; secretId: string; region?: string }
  | { driver: 'gcp-secret-manager'; name: string }
  | { driver: 'azure-key-vault'; vaultUrl: string; secretName: string }

export interface JwksConfig {
  source: 'managed' | 'jwks'
  rotationDays?: number
  algorithm?: 'RS256' | 'ES256' | 'PS256' | 'EdDSA'
  /**
   * Onde o keystore PRIVADO managed é persistido. String = atalho p/ arquivo
   * (`{driver:'file', path}`). Objeto `{ driver }` = cofre (file/drive/vault).
   * Ausente = chave efêmera por boot (sem rotação real).
   */
  store?: KeystoreStoreConfig
  /** Encripta o keystore em repouso (APP_KEY). Default backend-aware: file/drive ON, vault real OFF. */
  encrypt?: boolean
  keys?: Record<string, unknown>[]
}
```

> **Nota:** os drivers de cloud (`hashicorp/aws/gcp/azure`) estão no TIPO (para a API ser estável), mas o resolver desta fatia lança "ainda não disponível" — eles chegam nos packages-irmãos.

- [ ] **Step 2: Write the failing test (append em keystore_manager.spec.ts)**

```ts
import { resolveKeystoreVault } from '../../src/keys/keystore_manager.js'
import { FileKeystoreVault, DriveKeystoreVault } from '../../src/keys/keystore_vault.js'

test.group('resolveKeystoreVault', () => {
  const makePath = (p: string) => '/abs/' + p

  test('string → FileKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault('tmp/jwks.json', makePath), FileKeystoreVault)
  })
  test('{driver:file} → FileKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'file', path: 'tmp/x.json' }, makePath), FileKeystoreVault)
  })
  test('{driver:drive} → DriveKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'drive', key: 'keys/jwks.json' }, makePath), DriveKeystoreVault)
  })
  test('instância custom passa direto', ({ assert }) => {
    const custom = { read: async () => null, write: async () => {} }
    assert.strictEqual(resolveKeystoreVault(custom as any, makePath), custom)
  })
  test('driver de cloud → erro "ainda não disponível"', ({ assert }) => {
    assert.throws(
      () => resolveKeystoreVault({ driver: 'aws-secrets-manager', secretId: 's' } as any, makePath),
      /aws-secrets-manager|vault-aws/
    )
  })
})
```

- [ ] **Step 3: Implement the resolver em keystore_manager.ts**

```ts
import { FileKeystoreVault, DriveKeystoreVault, type KeystoreVault } from './keystore_vault.js'
import type { KeystoreStoreConfig } from '@dudousxd/adonis-authkit-core'

/** Packages-irmãos que entregam os cofres de cloud (planos futuros). */
const CLOUD_DRIVER_PACKAGE: Record<string, string> = {
  'hashicorp-vault': '@dudousxd/adonis-authkit-vault-hashicorp',
  'aws-secrets-manager': '@dudousxd/adonis-authkit-vault-aws',
  'gcp-secret-manager': '@dudousxd/adonis-authkit-vault-gcp',
  'azure-key-vault': '@dudousxd/adonis-authkit-vault-azure',
}

/**
 * Resolve a config `store` num {@link KeystoreVault}. `makePath` = `app.makePath`
 * (resolve paths relativos à raiz do app). Instância custom (com `read`/`write`)
 * passa direto. Drivers de cloud lançam nesta fatia (chegam nos packages-irmãos).
 */
export function resolveKeystoreVault(
  store: KeystoreStoreConfig | KeystoreVault,
  makePath: (p: string) => string
): KeystoreVault {
  if (typeof store === 'string') return new FileKeystoreVault(makePath(store))
  if (typeof (store as KeystoreVault).read === 'function') return store as KeystoreVault
  const cfg = store as Exclude<KeystoreStoreConfig, string>
  switch (cfg.driver) {
    case 'file':
      return new FileKeystoreVault(makePath(cfg.path))
    case 'drive':
      return new DriveKeystoreVault(cfg.key, cfg.disk)
    default: {
      const pkg = CLOUD_DRIVER_PACKAGE[(cfg as any).driver]
      throw new Error(
        `AuthKit keystore: driver "${(cfg as any).driver}" requer o package ${pkg ?? '(desconhecido)'} ` +
          `(ainda não disponível nesta versão).`
      )
    }
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"   # 9 passed
npx tsc --noEmit
# Rebuild do core para o authkit-server enxergar o novo tipo exportado:
cd ../authkit-core && npm run build && cd ../authkit-server && npx tsc --noEmit
```
Expected: testes PASS; typecheck limpo (o core exporta `KeystoreStoreConfig`).

- [ ] **Step 5: Commit**

```bash
git add packages/authkit-core/src/types/server_config.ts \
        packages/authkit-server/src/keys/keystore_manager.ts \
        packages/authkit-server/tests/keys/keystore_manager.spec.ts
git commit -m "feat(keys): resolveKeystoreVault + JwksConfig.store pluggável + encrypt"
```

---

## Task 9: Wire do boot (`define_config`) ao `KeystoreManager`

**Files:**
- Modify: `src/define_config.ts:958-975`
- Test: `tests/keys/define_config_jwks.spec.ts` (append — testa a função de wiring pura)

- [ ] **Step 1: Write the failing test**

Extraia o default de `encrypt` para uma função pura testável e teste-a:

```ts
import { defaultEncryptForStore } from '../../src/define_config.js'

test.group('default de encrypt backend-aware', () => {
  test('file/string/drive → ON', ({ assert }) => {
    assert.isTrue(defaultEncryptForStore('tmp/x.json'))
    assert.isTrue(defaultEncryptForStore({ driver: 'file', path: 'x' }))
    assert.isTrue(defaultEncryptForStore({ driver: 'drive', key: 'k' }))
  })
  test('vault real → OFF', ({ assert }) => {
    assert.isFalse(defaultEncryptForStore({ driver: 'aws-secrets-manager', secretId: 's' } as any))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="define_config_jwks.spec.ts"`
Expected: FAIL — `defaultEncryptForStore` não existe.

- [ ] **Step 3: Implement the helper + rewire the managed+store branch**

Adicione a helper pura em `define_config.ts`:

```ts
import type { KeystoreStoreConfig } from '@dudousxd/adonis-authkit-core'

/** Default backend-aware de encryption: file/drive ON; vaults reais OFF. */
export function defaultEncryptForStore(store: KeystoreStoreConfig): boolean {
  if (typeof store === 'string') return true
  return store.driver === 'file' || store.driver === 'drive'
}
```

Substitua o ramo `if (jwksConfig.store)` (atual `ensureKeystore` síncrono) por:

```ts
import { KeystoreManager, resolveKeystoreVault } from './keys/keystore_manager.js'
import { KeystoreCodec } from './keys/keystore_codec.js'
import { loadEncryptionService } from './keys/keystore_crypto.js'

// ...dentro do resolver, no ramo managed:
if (jwksConfig.source === 'managed') {
  const alg = jwksConfig.algorithm ?? 'RS256'
  if (jwksConfig.store) {
    const vault = resolveKeystoreVault(jwksConfig.store as any, (p) => app.makePath(p))
    const encrypt = jwksConfig.encrypt ?? defaultEncryptForStore(jwksConfig.store as any)
    const enc = encrypt ? await loadEncryptionService() : undefined
    const manager = new KeystoreManager(vault, new KeystoreCodec({ encrypt, enc }), alg)
    const store = await manager.ensure()
    // Remove o metadado interno `iat` antes de entregar ao oidc-provider.
    jwks = { keys: store.keys.map(({ iat: _iat, ...jwk }) => jwk) }
  } else {
    jwks = await generateJwks(alg)
  }
} else {
  jwks = { keys: jwksConfig.keys ?? [] }
}
```

> Remova o import agora não-usado de `ensureKeystore` no topo (se ficar órfão, `tsc` acusa).

- [ ] **Step 4: Run tests + typecheck + smoke**

```bash
node --import=@poppinss/ts-exec bin/test.ts --files="define_config_jwks.spec.ts"   # 6 passed
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"                 # boot real ainda sobe
```
Expected: PASS; o smoke confirma que o boot com keystore em arquivo (agora via manager) ainda funciona.

- [ ] **Step 5: Commit**

```bash
git add src/define_config.ts tests/keys/define_config_jwks.spec.ts
git commit -m "feat(keys): boot usa KeystoreManager (encrypt backend-aware) no managed+store"
```

---

## Task 10: Migrar `authkit:keys:rotate` para o `KeystoreManager`

**Files:**
- Modify: `commands/keys_rotate.ts:55-115`
- Test: `tests/keystore_rotation.spec.ts` (já existe; garante que a rotação via manager mantém o comportamento)

- [ ] **Step 1: Write/extend the failing test**

Adicione um teste que exercita o manager no mesmo cenário do comando (rotação em arquivo, grace) em `tests/keys/keystore_manager.spec.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'

test.group('KeystoreManager em arquivo (paridade com o comando)', (group) => {
  let dir: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-mgr-')) })
  group.each.teardown(() => rmSync(dir, { recursive: true, force: true }))

  test('rotate --retire mantém só a nova', async ({ assert }) => {
    const vault = new FileKeystoreVault(join(dir, 'jwks.json'))
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    await mgr.ensure()
    const res = await mgr.rotate(2, true)
    const store = (await mgr.read())!
    assert.lengthOf(store.keys, 1)
    assert.equal(store.keys[0].kid, res.newKid)
    assert.isAbove(res.retiredKids.length, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it passes (manager já implementado)**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"`
Expected: PASS.

- [ ] **Step 3: Rewire the command to use the manager**

Em `commands/keys_rotate.ts`, troque os imports de `rotateKeystore/readKeystore` por `KeystoreManager`/`resolveKeystoreVault`/`KeystoreCodec`/`loadEncryptionService`, e no `run()` (após validar `source==='managed'` e `store`):

```ts
import { KeystoreManager, resolveKeystoreVault } from '../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../src/keys/keystore_codec.js'
import { loadEncryptionService } from '../src/keys/keystore_crypto.js'
import { defaultEncryptForStore } from '../src/define_config.js'
import { signingKeyAgeDays } from '../src/keys/keystore.js'

// ...em run(), substituindo o uso de readKeystore/rotateKeystore:
const vault = resolveKeystoreVault(store as any, (p) => this.app.makePath(p))
const encrypt = (jwksInput as any).encrypt ?? defaultEncryptForStore(store as any)
const enc = encrypt ? await loadEncryptionService() : undefined
const manager = new KeystoreManager(vault, new KeystoreCodec({ encrypt, enc }), alg)

const current = await manager.read()
const ageDays = signingKeyAgeDays(current)
if (ageDays !== null) this.logger.info(`Chave de assinatura corrente tem ~${ageDays} dia(s) de idade.`)

if (this.dryRun) {
  const plan = await manager.plan(keep, retire)
  // ...imprime plan (igual ao atual)...
  return
}

const { newKid, retiredKids, store: result } = await manager.rotate(keep, retire)
// ...logs de sucesso + audit (igual ao atual)...
```

Mantenha o resto do comando (flags, mensagens, audit) idêntico.

- [ ] **Step 4: Run tests + typecheck**

```bash
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_rotation.spec.ts"
npx tsc --noEmit
```
Expected: PASS; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add commands/keys_rotate.ts tests/keys/keystore_manager.spec.ts
git commit -m "refactor(keys): authkit:keys:rotate usa KeystoreManager (cofre + encryption)"
```

---

## Task 11: Idade da chave no `doctor` (Fatia A)

**Files:**
- Modify: `src/doctor/checks.ts`
- Modify: `commands/doctor.ts`
- Test: `tests/doctor_checks.spec.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
// em tests/doctor_checks.spec.ts
import { signingKeyAgeFinding } from '../src/doctor/checks.js'

test('signingKeyAgeFinding: warn quando idade > maxAgeDays', ({ assert }) => {
  assert.equal(signingKeyAgeFinding(120, 90).level, 'warn')
  assert.equal(signingKeyAgeFinding(30, 90).level, 'ok')
  assert.equal(signingKeyAgeFinding(null, 90).level, 'ok') // sem keystore managed → no-op ok
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import=@poppinss/ts-exec bin/test.ts --files="doctor_checks.spec.ts"`
Expected: FAIL — `signingKeyAgeFinding` não existe.

- [ ] **Step 3: Implement the pure finding**

Em `src/doctor/checks.ts`:

```ts
/**
 * Finding da idade da chave de assinatura managed. `ageDays === null` (sem
 * keystore em arquivo/cofre) → no-op `ok`. Acima de `maxAgeDays` → `warn`.
 */
export function signingKeyAgeFinding(ageDays: number | null, maxAgeDays: number): Finding {
  if (ageDays === null) return { level: 'ok', message: 'jwks: idade da chave não aplicável (sem keystore persistido).' }
  if (ageDays > maxAgeDays) {
    return {
      level: 'warn',
      message: `jwks: chave de assinatura tem ~${ageDays}d (> ${maxAgeDays}d) — considere rotacionar (authkit:keys:rotate).`,
    }
  }
  return { level: 'ok', message: `jwks: chave de assinatura tem ~${ageDays}d.` }
}
```

- [ ] **Step 4: Wire no comando doctor**

Em `commands/doctor.ts`, dentro de `run()` (após resolver `authkitConfig`), leia a idade via manager quando houver keystore managed+store e imprima o finding:

```ts
import { KeystoreManager, resolveKeystoreVault } from '../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../src/keys/keystore_codec.js'
import { signingKeyAgeDays } from '../src/keys/keystore.js'
import { signingKeyAgeFinding } from '../src/doctor/checks.js'

// ...após montar `findings` e antes de this.print(findings):
const jwksInput = (authkitConfig?.jwksConfig ?? authkitConfig?.jwks) as any
if (jwksInput?.source === 'managed' && jwksInput?.store) {
  try {
    const vault = resolveKeystoreVault(jwksInput.store, (p) => this.app.makePath(p))
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), jwksInput.algorithm ?? 'RS256')
    // read sem encryption: se o store estiver encriptado, decode lança → tratamos como "indisponível".
    const store = await mgr.read().catch(() => null)
    const maxAge = jwksInput.rotationDays ?? 90
    findings.push(signingKeyAgeFinding(signingKeyAgeDays(store), maxAge))
  } catch {
    /* idade é best-effort no doctor */
  }
}
```

> Nota: para keystore encriptado, o doctor não decifra (não força APP_KEY aqui) — cai no `catch`/`null` e reporta "não aplicável". A idade exata aparece pós-rotação ou no painel do dashboard (Fatia D).

- [ ] **Step 5: Run tests + typecheck + commit**

```bash
node --import=@poppinss/ts-exec bin/test.ts --files="doctor_checks.spec.ts"
npx tsc --noEmit
git add src/doctor/checks.ts commands/doctor.ts tests/doctor_checks.spec.ts
git commit -m "feat(keys): doctor reporta idade da chave de assinatura managed"
```

---

## Task 12: Suíte completa + typecheck final

**Files:** nenhum (verificação)

- [ ] **Step 1: Rodar a suíte inteira do package**

```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts
```
Expected: tudo PASS (incl. `keystore_rotation.spec.ts`, `smoke.spec.ts`, `jwks_manager.spec.ts`, os novos `keys/*`).

- [ ] **Step 2: Typecheck do package + do core**

```bash
npx tsc --noEmit
cd ../authkit-core && npm run build && npx tsc --noEmit && cd ../authkit-server
```
Expected: limpo nos dois.

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "test(keys): suíte verde + typecheck para Fatia A+B-core" || echo "nada a commitar"
```

---

## Notas de follow-up (fora desta fatia)
- **Cloud vault packages** (`@dudousxd/adonis-authkit-vault-{hashicorp,aws,gcp,azure}`): cada um implementa `KeystoreVault` e registra no resolver via import lazy. Plano-irmão por package.
- **Fatia C (hot-reload):** `OidcService.reloadKeys()` + poll de `manager.head()`.
- **Fatia D (scheduler + política + dashboard):** setting `key_rotation`, housekeeping com `@adonisjs/lock.acquireImmediately()`, endpoints/painel admin.
```
