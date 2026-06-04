import type { OidcService } from '../provider/oidc_service.js'
import type { EnumeratedArtifact, OidcAdapter } from '../adapters/adapter_contract.js'

/** Uma sessão ativa do IdP (login do usuário no provider), apresentada ao admin. */
export interface AdminSession {
  /** Id do artefato `Session` no adapter. */
  id: string
  accountId: string
  /** Epoch (segundos) do login, quando presente no payload. */
  loginTs?: number
  /** Métodos de autenticação registrados na sessão (amr), quando presentes. */
  amr?: string[]
}

/** Um grant (autorização concedida a um client), com a contagem de tokens vivos. */
export interface AdminGrant {
  /** Id do artefato `Grant` no adapter (== grantId dos tokens). */
  id: string
  accountId: string
  clientId?: string
  /** Tokens de acesso vivos que referenciam este grant. */
  accessTokens: number
  /** Refresh tokens vivos que referenciam este grant. */
  refreshTokens: number
}

/** Resultado de uma revogação em massa das sessões/grants de uma conta. */
export interface RevokeResult {
  sessions: number
  grants: number
  accessTokens: number
  refreshTokens: number
}

/**
 * Serviço de inspeção/revogação das SESSÕES e GRANTS ativos de uma conta,
 * persistidos pelo oidc-provider via o MESMO `AdapterClass` (mesmo padrão do
 * {@link AdminClientsService}). Encapsula:
 *   - a enumeração via a capacidade opcional `list` do adapter (degrada quando
 *     ausente, igual ao CRUD de clients);
 *   - a destruição das sessões + grants da conta. Destruir um grant CASCATEIA a
 *     invalidação dos tokens no oidc-provider: os consumidores de access/refresh
 *     token carregam `Grant.find(token.grantId)` e lançam `InvalidToken('grant not
 *     found')` quando o grant some (verificado em oidc-provider v9). Mesmo assim,
 *     por garantia (belt-and-braces), também destruímos as linhas de AT/RT que
 *     referenciam os grants revogados quando o adapter enumera.
 */
export class AdminSessionsService {
  #AdapterClass: any

  constructor(oidc: OidcService) {
    this.#AdapterClass = oidc.config.AdapterClass
  }

  #adapter(model: string): OidcAdapter {
    return new (this.#AdapterClass as any)(model) as OidcAdapter
  }

  /** Indica se o adapter suporta enumeração (capacidade opcional). */
  get canList(): boolean {
    return typeof this.#adapter('Session').list === 'function'
  }

  async #listModel(model: string): Promise<EnumeratedArtifact[]> {
    const adapter = this.#adapter(model)
    if (!adapter.list) return []
    return adapter.list()
  }

  /** Lista as sessões ativas da conta (vazio quando o adapter não enumera). */
  async listSessions(accountId: string): Promise<AdminSession[]> {
    const rows = await this.#listModel('Session')
    return rows
      .filter((r) => (r.payload.accountId as string | undefined) === accountId)
      .map((r) => ({
        id: r.id,
        accountId,
        loginTs: r.payload.loginTs as number | undefined,
        amr: (r.payload.amr as string[] | undefined) ?? undefined,
      }))
  }

  /**
   * Lista os grants da conta, com a contagem de access/refresh tokens vivos que
   * referenciam cada grant (`payload.grantId`). As contagens são baratas (uma
   * enumeração de cada model token), feitas só quando o adapter enumera.
   */
  async listGrants(accountId: string): Promise<AdminGrant[]> {
    const rows = await this.#listModel('Grant')
    const grants = rows.filter((r) => (r.payload.accountId as string | undefined) === accountId)
    if (grants.length === 0) return []

    const atByGrant = await this.#countByGrant('AccessToken')
    const rtByGrant = await this.#countByGrant('RefreshToken')

    return grants.map((g) => ({
      id: g.id,
      accountId,
      clientId: g.payload.clientId as string | undefined,
      accessTokens: atByGrant.get(g.id) ?? 0,
      refreshTokens: rtByGrant.get(g.id) ?? 0,
    }))
  }

  /** Conta artefatos de um model token agrupados por `grantId`. */
  async #countByGrant(model: string): Promise<Map<string, number>> {
    const rows = await this.#listModel(model)
    const map = new Map<string, number>()
    for (const r of rows) {
      const gid = r.payload.grantId as string | undefined
      if (!gid) continue
      map.set(gid, (map.get(gid) ?? 0) + 1)
    }
    return map
  }

  /**
   * Revoga TODAS as sessões e grants da conta. Destruir os grants já invalida os
   * tokens (cascata via `grant not found`); ainda assim, quando o adapter enumera,
   * destruímos explicitamente as linhas de AT/RT desses grants (belt-and-braces),
   * deixando o store limpo. Retorna as contagens do que foi removido.
   */
  async revokeAll(accountId: string): Promise<RevokeResult> {
    const sessionAdapter = this.#adapter('Session')
    const grantAdapter = this.#adapter('Grant')

    const sessions = await this.listSessions(accountId)
    for (const s of sessions) {
      await sessionAdapter.destroy(s.id)
    }

    const grants = await this.listGrants(accountId)
    const grantIds = new Set(grants.map((g) => g.id))
    let accessTokens = 0
    let refreshTokens = 0

    // Belt-and-braces: destrói as linhas de token que referenciam os grants alvo
    // ANTES de destruir os grants (quando o adapter enumera).
    accessTokens = await this.#destroyTokensOfGrants('AccessToken', grantIds)
    refreshTokens = await this.#destroyTokensOfGrants('RefreshToken', grantIds)

    for (const g of grants) {
      // `revokeByGrantId` derruba os artefatos ligados ao grant (no Redis isso
      // limpa a lista do grant; no DB apaga as linhas com `grant_id`); `destroy`
      // remove o próprio artefato `Grant`.
      await grantAdapter.revokeByGrantId(g.id)
      await grantAdapter.destroy(g.id)
    }

    return {
      sessions: sessions.length,
      grants: grants.length,
      accessTokens,
      refreshTokens,
    }
  }

  /** Destrói (quando enumerável) os artefatos de um model token cujos grantId estão em `grantIds`. */
  async #destroyTokensOfGrants(model: string, grantIds: Set<string>): Promise<number> {
    const adapter = this.#adapter(model)
    if (!adapter.list) return 0
    const rows = await adapter.list()
    let count = 0
    for (const r of rows) {
      const gid = r.payload.grantId as string | undefined
      if (gid && grantIds.has(gid)) {
        await adapter.destroy(r.id)
        count++
      }
    }
    return count
  }
}
