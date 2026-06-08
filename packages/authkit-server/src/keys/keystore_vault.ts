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
 * Cofre numa tabela Lucid dedicada (`authkit_keystore`, KV de uma linha). Compartilhado
 * entre instâncias (multi-instância nativo). Auto-cria a tabela no primeiro write — o
 * keystore carrega na resolução do config, ANTES do `start()` (onde o schema auto-manage
 * roda), então o vault não pode depender dela existir. `getConn` é lazy. `head()` = updated_at.
 */
export class LucidKeystoreVault implements KeystoreVault {
  constructor(
    private getConn: () => Promise<any>,
    private table = 'authkit_keystore',
    private key = 'jwks'
  ) {}

  private async ensureTable(conn: any): Promise<void> {
    if (await conn.schema.hasTable(this.table)) return
    try {
      await conn.schema.createTable(this.table, (t: any) => {
        t.string('key').notNullable().primary()
        t.text('blob').notNullable()
        t.bigInteger('updated_at').notNullable()
      })
    } catch (err) {
      // Outra instância criou a tabela entre o hasTable e o createTable (race no boot
      // multi-instância). Se já existe agora, OK; senão propaga.
      if (!(await conn.schema.hasTable(this.table))) throw err
    }
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
 * `getClient` é lazy. `head()` devolve o próprio blob (redis get é barato).
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

/** fetch mínimo que o vault HTTP usa (injetável p/ testes). */
type VaultFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>

export interface HashicorpVaultConfig {
  endpoint: string
  path: string
  token?: string
  mount?: string
  field?: string
}

/**
 * Cofre no HashiCorp Vault (KV v2, via API HTTP — sem SDK). Compartilhado entre
 * instâncias e com encryption/ACL próprios do Vault (por isso `encrypt` default OFF).
 * Crítico: erro HTTP não-404 lança (não degrada). `head()` = versão atual (metadata).
 */
export class HashicorpVaultKeystoreVault implements KeystoreVault {
  #endpoint: string
  #mount: string
  #path: string
  #field: string
  #token?: string
  #fetch: VaultFetch

  constructor(cfg: HashicorpVaultConfig, fetchImpl?: VaultFetch) {
    this.#endpoint = cfg.endpoint.replace(/\/+$/, '')
    this.#mount = (cfg.mount ?? 'secret').replace(/^\/+|\/+$/g, '')
    this.#path = cfg.path.replace(/^\/+/, '')
    this.#field = cfg.field ?? 'value'
    this.#token = cfg.token
    this.#fetch = fetchImpl ?? (globalThis.fetch as unknown as VaultFetch)
  }

  #headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.#token) h['x-vault-token'] = this.#token
    return h
  }
  #dataUrl() { return `${this.#endpoint}/v1/${this.#mount}/data/${this.#path}` }
  #metaUrl() { return `${this.#endpoint}/v1/${this.#mount}/metadata/${this.#path}` }

  async read(): Promise<string | null> {
    const res = await this.#fetch(this.#dataUrl(), { method: 'GET', headers: this.#headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`AuthKit keystore (hashicorp-vault): read falhou (HTTP ${res.status}).`)
    const body = await res.json()
    const value = body?.data?.data?.[this.#field]
    return typeof value === 'string' ? value : null
  }

  async write(blob: string): Promise<void> {
    const res = await this.#fetch(this.#dataUrl(), {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ data: { [this.#field]: blob } }),
    })
    if (!res.ok) throw new Error(`AuthKit keystore (hashicorp-vault): write falhou (HTTP ${res.status}).`)
  }

  async head(): Promise<string | null> {
    const res = await this.#fetch(this.#metaUrl(), { method: 'GET', headers: this.#headers() })
    if (res.status === 404) return null
    if (!res.ok) return null // head é best-effort p/ o poll
    const body = await res.json()
    const v = body?.data?.current_version
    return v === undefined || v === null ? null : String(v)
  }
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
