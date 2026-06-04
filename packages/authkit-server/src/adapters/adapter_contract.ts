/** Forma mínima do payload persistido pelo oidc-provider. */
export interface OidcPayload {
  [key: string]: unknown
  grantId?: string
  userCode?: string
  uid?: string
  consumed?: unknown
}

/** Um client OIDC enumerado do adapter (id + payload de metadata persistido). */
export interface EnumeratedClient {
  clientId: string
  payload: Record<string, unknown>
}

/** Contrato que o oidc-provider espera de um adapter (um por model). */
export interface OidcAdapter {
  upsert(id: string, payload: OidcPayload, expiresIn: number): Promise<void>
  find(id: string): Promise<OidcPayload | undefined>
  findByUserCode(userCode: string): Promise<OidcPayload | undefined>
  findByUid(uid: string): Promise<OidcPayload | undefined>
  consume(id: string): Promise<void>
  destroy(id: string): Promise<void>
  revokeByGrantId(grantId: string): Promise<void>
  /**
   * Enumera os artefatos do model deste adapter — usado SÓ para o model `Client`
   * pelo console admin, para listar clients persistidos (registro dinâmico/CRUD).
   * Capacidade OPCIONAL (estilo `AuditSink.list`): adapters que não conseguem
   * enumerar de forma barata omitem o método e a UI degrada graciosamente.
   */
  listClients?(): Promise<EnumeratedClient[]>
}
