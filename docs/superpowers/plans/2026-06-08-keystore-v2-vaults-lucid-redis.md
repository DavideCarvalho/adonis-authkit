# Keystore v2 — Vault providers Lucid + Redis (core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar dois providers de cofre do keystore JWKS em **core** (`authkit-server`): `lucid` (tabela dedicada `authkit_keystore`) e `redis` (uma key) — ambos **compartilhados nativamente entre instâncias**, o que os torna o melhor default para multi-instância + hot-reload (poll barato via `head`). `file` e `drive` já existem.

**Architecture:** Dois novos `KeystoreVault` em `keystore_vault.ts` que recebem accessors LAZY (`() => Promise<conn/client>`) — resolvem o `lucid.db`/`redis` do container só na hora do I/O. `LucidKeystoreVault` **auto-cria** sua tabela (evita dependência da ordem de boot, já que o keystore carrega na resolução do config, antes do `start()`). `resolveKeystoreVault` passa a receber um `ctx = { makePath, container }` (em vez de só `makePath`) p/ dar acesso ao container aos drivers lucid/redis — muda os 4 call sites. `defaultEncryptForStore` inclui lucid/redis (blobs burros → encrypt ON). Warning de boot quando driver = redis (caveat de persistência).

**Tech Stack:** TypeScript, `@adonisjs/lucid` (peer já existente), `@adonisjs/redis`/`ioredis` (peer), Japa + `better-sqlite3` (`createTestDatabase`) + `ioredis-mock`.

**Pré-requisito (em `main`):** Fatias A+B/C/D (KeystoreVault, resolveKeystoreVault, KeystoreManager, hot-reload poll).

**Escopo:** SÓ lucid + redis em core (drive já existe; cloud vaults externos = packages separados, fora daqui).

**Comandos:**
```bash
cd packages/authkit-server
node --import=@poppinss/ts-exec bin/test.ts --files="<arquivo>.spec.ts"
npx tsc --noEmit
```

---

## File Structure

**Modificar:**
- `packages/authkit-core/src/types/server_config.ts` — `KeystoreStoreConfig` ganha `lucid` + `redis`.
- `packages/authkit-server/src/keys/keystore_vault.ts` — `LucidKeystoreVault` + `RedisKeystoreVault`.
- `packages/authkit-server/src/keys/keystore_manager.ts` — `resolveKeystoreVault(store, ctx)` (nova assinatura) + cases lucid/redis + `KeystoreVaultContext`.
- `packages/authkit-server/src/define_config.ts` — call site do resolver → ctx; `defaultEncryptForStore` inclui lucid/redis; warning de boot p/ redis.
- `packages/authkit-server/commands/keys_rotate.ts` — call site do resolver → ctx.
- `packages/authkit-server/commands/doctor.ts` — call site do resolver → ctx; (opcional) finding p/ redis persistence.
- `packages/authkit-server/providers/authkit_server_provider.ts` — `buildManager` → resolver com ctx.
- Testes: `tests/keys/keystore_vault.spec.ts` (lucid+redis round-trip), `tests/keys/keystore_manager.spec.ts` (resolver cases + nova assinatura).

---

## Task 1: Config — `lucid` + `redis` em `KeystoreStoreConfig`

**Files:** Modify `packages/authkit-core/src/types/server_config.ts`

- [ ] **Step 1:** Adicione os dois variants à union (após `drive`, antes dos cloud):
```ts
export type KeystoreStoreConfig =
  | string
  | { driver: 'file'; path: string }
  | { driver: 'drive'; disk?: string; key: string }
  | { driver: 'lucid'; table?: string; connection?: string; key?: string }
  | { driver: 'redis'; connection?: string; key?: string }
  | { driver: 'hashicorp-vault'; endpoint: string; path: string; token?: string }
  | { driver: 'aws-secrets-manager'; secretId: string; region?: string }
  | { driver: 'gcp-secret-manager'; name: string }
  | { driver: 'azure-key-vault'; vaultUrl: string; secretName: string }
```

- [ ] **Step 2:** Rebuild do core + tsc:
```bash
cd packages/authkit-core && npm run build && npx tsc --noEmit && cd ../authkit-server && npx tsc --noEmit
git add packages/authkit-core/src/types/server_config.ts
git commit -m "feat(keys): KeystoreStoreConfig aceita drivers lucid + redis"
```

---

## Task 2: `LucidKeystoreVault` + `RedisKeystoreVault`

**Files:** Modify `packages/authkit-server/src/keys/keystore_vault.ts`; Test `tests/keys/keystore_vault.spec.ts`

- [ ] **Step 1: Write failing tests** (append em `tests/keys/keystore_vault.spec.ts`)
```ts
import { LucidKeystoreVault, RedisKeystoreVault } from '../../src/keys/keystore_vault.js'
import { createTestDatabase } from '../bootstrap.js'
import RedisMock from 'ioredis-mock'

test.group('LucidKeystoreVault', (group) => {
  let db: any
  group.each.setup(() => { db = createTestDatabase(); return async () => db.manager.closeAll() })

  test('read ausente → null; write auto-cria a tabela; round-trip; head muda', async ({ assert }) => {
    const v = new LucidKeystoreVault(async () => db.connection())
    assert.isNull(await v.read())            // tabela ainda não existe → null
    await v.write('blob-1')                  // auto-cria a tabela
    assert.equal(await v.read(), 'blob-1')
    const h1 = await v.head()
    assert.isString(h1)
    await v.write('blob-2')
    assert.equal(await v.read(), 'blob-2')
  })
})

test.group('RedisKeystoreVault', () => {
  test('read ausente → null; round-trip; head reflete mudança', async ({ assert }) => {
    const client = new RedisMock()
    const v = new RedisKeystoreVault(async () => client)
    assert.isNull(await v.read())
    await v.write('blob-1')
    assert.equal(await v.read(), 'blob-1')
    assert.equal(await v.head(), 'blob-1')
    await v.write('blob-2')
    assert.equal(await v.read(), 'blob-2')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (classes não existem).

- [ ] **Step 3: Implement** em `src/keys/keystore_vault.ts` (após `DriveKeystoreVault`):
```ts
/**
 * Cofre numa tabela Lucid dedicada (`authkit_keystore`, KV de uma linha). Compartilhado
 * entre instâncias (multi-instância nativo). Auto-cria a tabela no primeiro write — o
 * keystore carrega na resolução do config, ANTES do `start()` (onde o schema auto-manage
 * roda), então o vault não pode depender dela existir. `getConn` é lazy (resolve o
 * `lucid.db` do container só no I/O). `head()` = `updated_at`.
 */
export class LucidKeystoreVault implements KeystoreVault {
  constructor(
    private getConn: () => Promise<any>,
    private table = 'authkit_keystore',
    private key = 'jwks'
  ) {}

  private async ensureTable(conn: any): Promise<void> {
    if (await conn.schema.hasTable(this.table)) return
    await conn.schema.createTable(this.table, (t: any) => {
      t.string('key').notNullable().primary()
      t.text('blob').notNullable()
      t.bigInteger('updated_at').notNullable()
    })
  }

  async read(): Promise<string | null> {
    const conn = await this.getConn()
    if (!(await conn.schema.hasTable(this.table))) return null
    const row = await conn.from(this.table).where('key', this.key).first()
    return row ? (row.blob as string) : null
  }

  async write(blob: string): Promise<void> {
    const conn = await this.getConn()
    await this.ensureTable(conn)
    await conn
      .table(this.table)
      .insert({ key: this.key, blob, updated_at: Date.now() })
      .onConflict('key')
      .merge()
  }

  async head(): Promise<string | null> {
    const conn = await this.getConn()
    if (!(await conn.schema.hasTable(this.table))) return null
    const row = await conn.from(this.table).where('key', this.key).first()
    return row ? String(row.updated_at) : null
  }
}

/**
 * Cofre numa key do Redis. Compartilhado entre instâncias (multi-instância nativo).
 * `getClient` é lazy (resolve a conexão do `@adonisjs/redis` só no I/O). `head()`
 * devolve o próprio blob (redis get é barato; comparação de string detecta mudança).
 *
 * ⚠️ Requer Redis com PERSISTÊNCIA (RDB/AOF): num Redis cache-only, um flush apaga o
 * keystore → todos os tokens invalidam. (Há um warning no boot quando o driver é redis.)
 */
export class RedisKeystoreVault implements KeystoreVault {
  constructor(
    private getClient: () => Promise<any>,
    private key = 'authkit:jwks'
  ) {}

  async read(): Promise<string | null> {
    const client = await this.getClient()
    return (await client.get(this.key)) ?? null
  }

  async write(blob: string): Promise<void> {
    const client = await this.getClient()
    await client.set(this.key, blob)
  }

  async head(): Promise<string | null> {
    const client = await this.getClient()
    return (await client.get(this.key)) ?? null
  }
}
```
NOTA: confirme que a query builder do Lucid (`conn.from`/`conn.table`/`conn.schema`/`.onConflict().merge()`) é o que `db.connection()` expõe — o `createTestDatabase()` retorna o `Database` manager e `db.connection()` o QueryClient (knex-like). `.onConflict('key').merge()` é suportado pelo Lucid (pg/mysql/sqlite). Se `better-sqlite3` reclamar do upsert, use o fallback: `const exists = await conn.from(table).where('key',key).first(); if (exists) await conn.from(table).where('key',key).update({blob, updated_at: Date.now()}); else await conn.table(table).insert({...})`.

- [ ] **Step 4: Run — expect PASS** + commit
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_vault.spec.ts"
npx tsc --noEmit
git add src/keys/keystore_vault.ts tests/keys/keystore_vault.spec.ts
git commit -m "feat(keys): LucidKeystoreVault + RedisKeystoreVault (cofres compartilhados)"
```

---

## Task 3: `resolveKeystoreVault(store, ctx)` — nova assinatura + cases lucid/redis

**Files:** Modify `src/keys/keystore_manager.ts`; Test append em `tests/keys/keystore_manager.spec.ts`

- [ ] **Step 1: Write failing tests** (atualize o grupo `resolveKeystoreVault` em `tests/keys/keystore_manager.spec.ts`)
A assinatura muda de `(store, makePath)` p/ `(store, ctx)`. Atualize os testes existentes e adicione lucid/redis:
```ts
import { LucidKeystoreVault, RedisKeystoreVault } from '../../src/keys/keystore_vault.js'

const ctx = {
  makePath: (p: string) => '/abs/' + p,
  container: { make: async (_t: string) => ({}) },
}

test.group('resolveKeystoreVault', () => {
  test('string → FileKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault('tmp/jwks.json', ctx), FileKeystoreVault)
  })
  test('{driver:file} → FileKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'file', path: 'tmp/x.json' }, ctx), FileKeystoreVault)
  })
  test('{driver:drive} → DriveKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'drive', key: 'keys/jwks.json' }, ctx), DriveKeystoreVault)
  })
  test('{driver:lucid} → LucidKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'lucid' }, ctx), LucidKeystoreVault)
  })
  test('{driver:redis} → RedisKeystoreVault', ({ assert }) => {
    assert.instanceOf(resolveKeystoreVault({ driver: 'redis' }, ctx), RedisKeystoreVault)
  })
  test('instância custom passa direto', ({ assert }) => {
    const custom = { read: async () => null, write: async () => {} }
    assert.strictEqual(resolveKeystoreVault(custom as any, ctx), custom)
  })
  test('driver de cloud → erro "ainda não disponível"', ({ assert }) => {
    assert.throws(() => resolveKeystoreVault({ driver: 'aws-secrets-manager', secretId: 's' } as any, ctx), /aws-secrets-manager|vault-aws/)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (assinatura/cases).

- [ ] **Step 3: Implement** — substitua a assinatura e o corpo de `resolveKeystoreVault`:
```ts
import { FileKeystoreVault, DriveKeystoreVault, LucidKeystoreVault, RedisKeystoreVault } from './keystore_vault.js'

/** Acesso mínimo ao app que o resolver precisa (paths + container p/ lucid/redis). */
export interface KeystoreVaultContext {
  makePath: (p: string) => string
  container: { make: (token: string) => Promise<any> }
}

export function resolveKeystoreVault(
  store: KeystoreStoreConfig | KeystoreVault,
  ctx: KeystoreVaultContext
): KeystoreVault {
  if (typeof store === 'string') return new FileKeystoreVault(ctx.makePath(store))
  if (typeof (store as KeystoreVault).read === 'function') return store as KeystoreVault
  const cfg = store as Exclude<KeystoreStoreConfig, string>
  switch (cfg.driver) {
    case 'file':
      return new FileKeystoreVault(ctx.makePath(cfg.path))
    case 'drive':
      return new DriveKeystoreVault(cfg.key, cfg.disk)
    case 'lucid':
      return new LucidKeystoreVault(
        async () => {
          const db: any = await ctx.container.make('lucid.db')
          return cfg.connection ? db.connection(cfg.connection) : db.connection()
        },
        cfg.table,
        cfg.key
      )
    case 'redis':
      return new RedisKeystoreVault(
        async () => {
          const rm: any = await ctx.container.make('redis')
          return cfg.connection ? rm.connection(cfg.connection) : rm.connection()
        },
        cfg.key
      )
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
Mantenha o `CLOUD_DRIVER_PACKAGE` map como está. Ajuste o import de `LucidKeystoreVault`/`RedisKeystoreVault`.

- [ ] **Step 4: Run + commit** (o tsc vai quebrar nos 4 call sites — a Task 4 conserta; ou faça tudo junto e rode o tsc no fim. PREFIRA: implemente o resolver, depois atualize os call sites na MESMA task antes de rodar o tsc/suite final — veja Task 4. Commit conjunto.)

---

## Task 4: Atualizar os 4 call sites do resolver p/ passar `ctx`

**Files:** Modify `src/define_config.ts`, `commands/keys_rotate.ts`, `commands/doctor.ts`, `providers/authkit_server_provider.ts`

Em cada call site, troque `resolveKeystoreVault(store, (p) => app.makePath(p))` por `resolveKeystoreVault(store, { makePath: (p) => app.makePath(p), container: app.container })`. Os nomes exatos (`app`/`this.app`/`appRef`) variam por arquivo — READ cada um e ajuste.

- [ ] **Step 1: `src/define_config.ts`** — no boot (ramo managed+store) e em qualquer outro uso. O resolver roda dentro do `(app) => ...`; use `{ makePath: (p) => app.makePath(p), container: app.container }`.
- [ ] **Step 2: `commands/keys_rotate.ts`** — usa `this.app.makePath`; `{ makePath: (p) => this.app.makePath(p), container: this.app.container }`.
- [ ] **Step 3: `commands/doctor.ts`** — idem (`this.app`).
- [ ] **Step 4: `providers/authkit_server_provider.ts`** — o `buildManager` usa `appRef.makePath`; `{ makePath: (p) => appRef.makePath(p), container: appRef.container }`.
- [ ] **Step 5: Verify + commit (Tasks 3+4 juntas)**
```bash
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts --files="keystore_manager.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts --files="smoke.spec.ts"
node --import=@poppinss/ts-exec bin/test.ts   # full suite, 0 regressões
git add src/keys/keystore_manager.ts tests/keys/keystore_manager.spec.ts src/define_config.ts commands/keys_rotate.ts commands/doctor.ts providers/authkit_server_provider.ts
git commit -m "feat(keys): resolveKeystoreVault(store, ctx) + cases lucid/redis (4 call sites)"
```

---

## Task 5: `defaultEncryptForStore` (lucid/redis ON) + warning de boot p/ redis

**Files:** Modify `src/define_config.ts`; Test append em `tests/keys/define_config_jwks.spec.ts`

- [ ] **Step 1: Write failing test** (append)
```ts
test.group('default de encrypt — lucid/redis', () => {
  test('lucid/redis → ON (blobs burros)', ({ assert }) => {
    assert.isTrue(defaultEncryptForStore({ driver: 'lucid' } as any))
    assert.isTrue(defaultEncryptForStore({ driver: 'redis' } as any))
  })
})
```

- [ ] **Step 2:** Atualize `defaultEncryptForStore` em `src/define_config.ts`:
```ts
export function defaultEncryptForStore(store: KeystoreStoreConfig): boolean {
  if (typeof store === 'string') return true
  return ['file', 'drive', 'lucid', 'redis'].includes(store.driver)
}
```

- [ ] **Step 3: Warning de boot p/ redis** — no resolver do `define_config`, quando o store resolvido tem `driver === 'redis'`, emita um `warn` (lazy logger, fail-safe) sobre a persistência:
```ts
// perto do warning de auto→disco; após resolver jwksConfig:
const storeCfg = (jwksConfig as { store?: any }).store
if (storeCfg && typeof storeCfg === 'object' && storeCfg.driver === 'redis') {
  await app.container.make('logger')
    .then((l: any) => l?.warn('AuthKit: keystore no driver "redis" — garanta PERSISTÊNCIA (RDB/AOF). Num Redis cache-only, um flush apaga o keystore e invalida todos os tokens.'))
    .catch(() => {})
}
```

- [ ] **Step 4: Verify + commit**
```bash
node --import=@poppinss/ts-exec bin/test.ts --files="define_config_jwks.spec.ts"
npx tsc --noEmit
node --import=@poppinss/ts-exec bin/test.ts
git add src/define_config.ts tests/keys/define_config_jwks.spec.ts
git commit -m "feat(keys): encrypt default ON p/ lucid/redis + warning de persistência do redis"
```

---

## Task 6: Verificação final + changeset + review

- [ ] **Step 1: Suíte + tsc (server + core)**
```bash
cd packages/authkit-server && node --import=@poppinss/ts-exec bin/test.ts && npx tsc --noEmit
cd ../authkit-core && npm run build && npx tsc --noEmit && cd ../authkit-server
```

- [ ] **Step 2: Changeset**
```bash
cat > ../../.changeset/keystore-v2-vaults-lucid-redis.md <<'EOF'
---
'@adonis-agora/authkit-server': minor
'@adonis-agora/authkit-core': minor
---

feat: cofres do keystore JWKS em Lucid e Redis. Novos drivers `jwks.store`:
`{ driver: 'lucid' }` (tabela dedicada `authkit_keystore`, auto-criada) e
`{ driver: 'redis' }` (uma key). Diferente de `file`, ambos são COMPARTILHADOS entre
instâncias — o melhor default para multi-instância + hot-reload (o poll lê um `head`
barato). Encryption at-rest (APP_KEY) ON por default nos dois. Warning no boot quando
`redis` é usado (exige persistência RDB/AOF). `resolveKeystoreVault` agora recebe um
contexto com acesso ao container.
EOF
git add ../../.changeset/keystore-v2-vaults-lucid-redis.md
git commit -m "chore: changeset vaults lucid+redis"
```

- [ ] **Step 3: Final review** (dispatch reviewer): (a) lucid auto-cria a tabela e funciona antes do `start()`; (b) lucid/redis resolvem db/redis LAZY (não no resolve); (c) os 4 call sites passam ctx corretamente; (d) encrypt default ON p/ lucid/redis; (e) head do lucid (updated_at) e do redis (blob) servem o poll; (f) warning de persistência do redis; (g) suíte verde + smoke.

---

## Notas / follow-up
- **Recomendação de doc:** Lucid é o default recomendado p/ multi-instância (sem infra extra; já tem Lucid). Redis p/ quem já tem Redis persistente. `file` só p/ single-instance/dev.
- **Cloud vaults** (`hashicorp/aws/gcp/azure`) seguem como packages-irmãos separados (SDKs externos) — fora deste plano.
- **head do redis** devolve o blob inteiro; p/ JWKS (poucos KB) é barato. Se virar gargalo, trocar por uma version-key incrementada no write.
