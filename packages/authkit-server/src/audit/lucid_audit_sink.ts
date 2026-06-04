import type {
  AuditEvent,
  AuditPage,
  AuditSink,
  ListAuditParams,
  StoredAuditEvent,
} from './audit_sink.js'

/**
 * Implementação default do {@link AuditSink} sobre um model Lucid composto de
 * `withAuditLog()`. Insere o evento na tabela `audit_logs` e suporta consulta
 * paginada para o console admin.
 *
 * BEST-EFFORT: erros de inserção são logados via `console.error` e engolidos —
 * a auditoria nunca deve lançar para dentro do caminho da request.
 */
export function lucidAuditSink(Model: any): AuditSink {
  return {
    async record(event: AuditEvent) {
      try {
        await Model.create({
          type: event.type,
          accountId: event.accountId ?? null,
          email: event.email ?? null,
          clientId: event.clientId ?? null,
          actorId: event.actorId ?? null,
          ip: event.ip ?? null,
          metadata: event.metadata ?? null,
        })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[authkit] audit sink falhou ao registrar evento', event.type, error)
      }
    },

    async list(params: ListAuditParams): Promise<AuditPage> {
      const page = Math.max(1, params.page ?? 1)
      const limit = Math.max(1, params.limit ?? 20)

      const base = () => {
        const q = Model.query()
        if (params.type) q.where('type', params.type)
        if (params.subject) q.where('accountId', params.subject)
        return q
      }

      const countResult = await base().count('* as total')
      const total = Number(countResult[0]?.$extras?.total ?? 0)

      const rows = await base()
        .orderBy('createdAt', 'desc')
        .offset((page - 1) * limit)
        .limit(limit)

      const data: StoredAuditEvent[] = rows.map((row: any) => ({
        id: String(row.id),
        type: row.type,
        accountId: row.accountId ?? null,
        email: row.email ?? null,
        clientId: row.clientId ?? null,
        actorId: row.actorId ?? null,
        ip: row.ip ?? null,
        metadata: row.metadata ?? undefined,
        // createdAt é um luxon DateTime no Lucid; normaliza para ISO string.
        createdAt: row.createdAt?.toISO?.() ?? row.createdAt ?? null,
      }))

      return { data, total }
    },
  }
}
