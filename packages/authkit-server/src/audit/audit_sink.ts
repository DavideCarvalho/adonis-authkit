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
  | 'impersonation.started'
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
  | 'password.rehashed'
  | 'email.change_requested'
  | 'email.changed'
  | 'login.new_ip_notified'
  | 'login.new_device'
  | 'bot_protection.rejected'
  | 'grant.revoked_by_user'
  | 'user.created'
  | 'user.password_reset_sent'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.deleted'
  | 'profile.updated'
  | 'account.deleted'
  | 'account.exported'
  | 'keys.rotated'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organization.member_added'
  | 'organization.member_removed'
  | 'organization.member_role_changed'
  | 'organization.member_role_updated'
  | 'organization.switched'
  | 'organization.deactivated'
  | 'organization.invitation_sent'
  | 'organization.invitation_accepted'
  | 'organization.invitation_revoked'
  // Email change (verified flow)
  | 'email_change.requested'
  | 'email_change.confirmed'
  | 'email_change.cancelled'
  // Security notices
  | 'security_notice.sent'
  // Settings
  | 'settings.updated'
  | 'maintenance.enabled'
  | 'maintenance.disabled'
  | 'trusted_device.revoked'

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
  /**
   * Anonimiza (LGPD/GDPR) os eventos de uma conta SEM apagar o histórico: remove
   * os identificadores pessoais (`email`, `ip`) e re-escreve o `accountId` para um
   * pseudônimo estável (`anon:<hash>`), preservando a linha do tempo, o `type` e a
   * forma para auditoria/forense. OPCIONAL: sinks write-only podem omitir — a
   * deleção de conta segue funcionando (best-effort), só não anonimiza.
   * Retorna a quantidade de linhas afetadas.
   */
  anonymizeAccount?(accountId: string): Promise<number>
}
