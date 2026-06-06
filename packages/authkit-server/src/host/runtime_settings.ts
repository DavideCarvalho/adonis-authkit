/**
 * Runtime Settings — mecanismo genérico de configuração persistida em banco.
 *
 * A tabela `auth_settings` é OPCIONAL (capability-probed via SELECT tentativo).
 * Se a tabela não existir, todas as operações retornam null/empty sem erro — os
 * callers devem usar o fallback de config estático. A leitura usa cache em
 * memória com TTL curto (default 15s) para eliminar overhead por request; o
 * método `invalidate()` limpa o cache imediatamente (chamado após escrita).
 *
 * FAIL-SAFE TOTAL: qualquer erro de DB ou de probe → null + caller usa config.
 * Disponibilidade > proteção, consistente com o padrão de bot-protection.
 *
 * PROBE SEARCHPATH-AWARE: o probe usa `SELECT key FROM auth_settings LIMIT 1`
 * em vez de `schema.hasTable`, que ignora o search_path do Postgres. Assim,
 * quando a tabela existe num schema nomeado (ex.: `auth` com searchPath), o
 * probe detecta corretamente.
 *
 * CONEXÃO NOMEADA: quando `options.connection` for fornecido, todas as queries
 * usam `db.connection(name)` em vez da conexão default — necessário quando o
 * auth vive num schema/conexão separados (ex.: host com `auth` connection).
 *
 * @example
 * ```ts
 * const settings = new RuntimeSettings(db)
 * const raw = await settings.getSetting('bot_protection')
 * // raw é `unknown | null`. Null = tabela ausente ou key inexistente.
 * const botSetting = raw as BotProtectionSetting | null
 * ```
 *
 * Schema esperado da tabela `auth_settings`:
 * ```sql
 * CREATE TABLE auth_settings (
 *   key        TEXT PRIMARY KEY,
 *   value      TEXT NOT NULL,        -- JSON
 *   updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 *   updated_by TEXT                  -- nullable accountId do admin
 * );
 * ```
 */

/** Uma entrada da tabela `auth_settings`. */
export interface SettingRow {
  key: string
  value: unknown // JSON parseado
  updatedAt: Date | string | null
  updatedBy: string | null
}

/**
 * Capacidade de runtime settings. Presente quando a tabela `auth_settings`
 * existe. Use `supportsSettings` para verificar em runtime.
 */
export interface SettingsCapability {
  /** Lê uma key; retorna null se ausente ou tabela inexistente. Usa cache TTL. */
  getSetting(key: string): Promise<unknown | null>
  /** Grava (upsert) uma key com o value JSON-serializável. Invalida o cache. */
  setSetting(key: string, value: unknown, updatedBy?: string | null): Promise<void>
  /** Remove uma key. Invalida o cache. */
  deleteSetting(key: string): Promise<void>
  /** Lista todas as keys. Sem cache (low-frequency). */
  listSettings(): Promise<SettingRow[]>
}

/**
 * Type guard: o objeto (store ou serviço) expõe SettingsCapability?
 */
export function supportsSettings(obj: unknown): obj is SettingsCapability {
  return !!obj && typeof (obj as any).getSetting === 'function'
}

export interface RuntimeSettingsOptions {
  /** TTL do cache em ms. Default: 15_000 (15s). */
  ttlMs?: number
  /**
   * Nome da conexão Lucid a usar (ex.: 'auth'). Quando presente, todas as
   * queries usam `db.connection(name)` em vez da conexão default. Necessário
   * quando o schema de auth vive numa conexão nomeada com searchPath próprio.
   * Ausente (ou undefined) → conexão default (back-compat total).
   */
  connection?: string
}

type CacheEntry = { value: unknown | null; expiresAt: number }

/**
 * Implementação default do SettingsCapability sobre um `Database` Lucid.
 *
 * Tabela esperada: ver módulo JSDoc acima.
 */
export class RuntimeSettings implements SettingsCapability {
  private readonly db: any
  private readonly ttlMs: number
  private readonly connectionName: string | undefined
  private cache = new Map<string, CacheEntry>()
  /** null = não foi verificado ainda; false = tabela ausente; true = presente */
  private tablePresent: boolean | null = null

  constructor(db: any, opts: RuntimeSettingsOptions = {}) {
    this.db = db
    this.ttlMs = opts.ttlMs ?? 15_000
    this.connectionName = opts.connection
  }

  /**
   * Retorna o objeto de conexão Lucid correto.
   * Quando `connectionName` está definido, usa `db.connection(name)`;
   * caso contrário usa o `db` diretamente (conexão default).
   */
  private conn(): any {
    return this.connectionName ? this.db.connection(this.connectionName) : this.db
  }

  /**
   * Verifica (e memoriza) se a tabela `auth_settings` existe.
   *
   * Usa `SELECT key FROM auth_settings LIMIT 1` em vez de `schema.hasTable`
   * para ser searchPath-aware: `schema.hasTable` no Postgres ignora o
   * search_path e reporta "ausente" quando a tabela existe apenas no schema
   * configurado via searchPath da conexão. A tentativa de SELECT em try/catch
   * detecta a tabela corretamente independente do schema.
   *
   * Fail-safe: qualquer erro → false (tabela considerada ausente, sem lançar).
   */
  private async hasTable(): Promise<boolean> {
    if (this.tablePresent !== null) return this.tablePresent
    try {
      await this.conn().from('auth_settings').select('key').limit(1)
      this.tablePresent = true
      return true
    } catch {
      this.tablePresent = false
      return false
    }
  }

  async getSetting(key: string): Promise<unknown | null> {
    // Cache hit?
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    if (!(await this.hasTable())) {
      this._cache(key, null)
      return null
    }

    try {
      const row = await this.conn().from('auth_settings').where('key', key).first()
      const value = row ? this._parse(row.value) : null
      this._cache(key, value)
      return value
    } catch {
      // FAIL-SAFE: erro de DB → null, caller usa config estático.
      this._cache(key, null)
      return null
    }
  }

  async setSetting(key: string, value: unknown, updatedBy: string | null = null): Promise<void> {
    if (!(await this.hasTable())) return
    const json = JSON.stringify(value)
    try {
      // Delete first then insert = upsert (compatível com sqlite + pg sem UPSERT syntax).
      await this.conn().from('auth_settings').where('key', key).delete()
      await this.conn().table('auth_settings').insert({ key, value: json, updated_at: new Date(), updated_by: updatedBy })
    } catch {
      // Fail-safe: não lança.
    }
    this.invalidate(key)
  }

  async deleteSetting(key: string): Promise<void> {
    if (!(await this.hasTable())) return
    try {
      await this.conn().from('auth_settings').where('key', key).delete()
    } catch {
      // Fail-safe.
    }
    this.invalidate(key)
  }

  async listSettings(): Promise<SettingRow[]> {
    if (!(await this.hasTable())) return []
    try {
      const rows = await this.conn().from('auth_settings').select('*')
      return rows.map((r: any): SettingRow => ({
        key: r.key,
        value: this._parse(r.value),
        updatedAt: r.updated_at ?? null,
        updatedBy: r.updated_by ?? null,
      }))
    } catch {
      return []
    }
  }

  /**
   * Verifica se a tabela `auth_settings` está presente (mesmo resultado de
   * `hasTable()` privado, mas exposto para casos de diagnóstico como a UI admin).
   */
  async isTablePresent(): Promise<boolean> {
    return this.hasTable()
  }

  /**
   * Invalida o cache em memória. Sem argumento: limpa tudo.
   * Chamado AUTOMATICAMENTE após setSetting/deleteSetting.
   * Chame externamente após writes que contornam este serviço.
   */
  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  private _cache(key: string, value: unknown | null): void {
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  private _parse(raw: string | null | undefined): unknown | null {
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
}
