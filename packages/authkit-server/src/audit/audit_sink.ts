/**
 * Tipos de eventos de auditoria relevantes para segurança emitidos pelo IdP.
 */
export type AuditEventType =
  | 'login.success'
  | 'login.failure'
  | 'signup'
  | 'password_reset.issued'
  | 'password_reset.consumed'
  | 'pat.issued'
  | 'pat.revoked'
  | 'pat.used'
  | 'impersonation'
  | 'mfa.enabled'
  | 'mfa.disabled'
  | 'account.locked'
  | 'passkey.registered'
  | 'passkey.removed'
  | 'email_verification.issued'
  | 'email_verification.consumed'
  | 'client.created'
  | 'client.updated'
  | 'client.deleted'
  | 'session.revoked_all'
  | 'password.changed'
  | 'email.change_requested'
  | 'email.changed'
  | 'login.new_ip_notified'
  | 'grant.revoked_by_user'
  | 'user.created'
  | 'user.password_reset_sent'
  | 'user.disabled'
  | 'user.enabled'
  | 'profile.updated'

/**
 * Evento de auditoria a registrar. O timestamp é definido pelo sink (não aqui).
 */
export interface AuditEvent {
  type: AuditEventType
  accountId?: string | null
  email?: string | null
  clientId?: string | null
  /** Impersonation: quem agiu (o admin). */
  actorId?: string | null
  ip?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Evento de auditoria já persistido (lido de volta pelo console admin). Carrega
 * o id e o timestamp atribuídos pelo sink.
 */
export interface StoredAuditEvent extends AuditEvent {
  id: string
  createdAt: Date | string | null
}

/** Filtros de listagem do log de auditoria (console admin). */
export interface ListAuditParams {
  /** Página (1-based). Default: 1. */
  page?: number
  /** Itens por página. Default: 20. */
  limit?: number
  /** Filtra por tipo de evento exato. */
  type?: string
  /** Filtra pelo subject (accountId) do evento. */
  subject?: string
}

/** Página de eventos + total absoluto. */
export interface AuditPage {
  data: StoredAuditEvent[]
  total: number
}

/**
 * Sink plugável de auditoria. Implementações devem ser best-effort: `record`
 * NUNCA deve lançar para dentro do caminho da request.
 *
 * `list` é OPCIONAL: sinks customizados podem só implementar `record` (write-only).
 * O console admin degrada graciosamente ("consulta não suportada") quando o sink
 * configurado não fornece `list`.
 */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>
  /** Lista eventos paginados (opcional — só sinks que suportam consulta). */
  list?(params: ListAuditParams): Promise<AuditPage>
}
