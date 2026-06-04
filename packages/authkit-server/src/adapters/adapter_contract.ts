/** Forma mínima do payload persistido pelo oidc-provider. */
export interface OidcPayload {
  [key: string]: unknown
  grantId?: string
  userCode?: string
  uid?: string
  consumed?: unknown
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
}
