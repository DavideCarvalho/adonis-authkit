import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import type { StoredAuditEvent } from '../../../audit/audit_sink.js'

const PAGE_SIZE = 20

/**
 * Log de auditoria do IdP, paginado e filtrável por tipo e subject (accountId).
 * Degrada graciosamente quando o sink configurado não suporta consulta: a view
 * mostra "consulta não suportada" em vez de uma lista.
 */
export default class AdminAuditController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const supported = typeof cfg.audit?.list === 'function'
    const type = (ctx.request.input('type', '') as string).trim()
    const subject = (ctx.request.input('subject', '') as string).trim()
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)

    if (!supported) {
      return render(ctx, 'admin/audit', {
        csrfToken: ctx.request.csrfToken,
        supported: false,
        type,
        subject,
        page: 1,
        totalPages: 1,
        total: 0,
        events: [],
      })
    }

    const result = await cfg.audit!.list!({
      page,
      limit: PAGE_SIZE,
      type: type || undefined,
      subject: subject || undefined,
    })
    const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE))

    return render(ctx, 'admin/audit', {
      csrfToken: ctx.request.csrfToken,
      supported: true,
      type,
      subject,
      page,
      totalPages,
      total: result.total,
      events: result.data.map((e: StoredAuditEvent) => ({
        id: e.id,
        type: e.type,
        accountId: e.accountId ?? '',
        email: e.email ?? '',
        clientId: e.clientId ?? '',
        actorId: e.actorId ?? '',
        ip: e.ip ?? '',
        createdAt: e.createdAt ? String(e.createdAt) : '',
      })),
    })
  }
}
