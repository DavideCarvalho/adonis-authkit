import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'

/**
 * Dashboard do console admin: contagens-resumo (usuários, clients estáticos) e
 * os eventos de auditoria mais recentes. Degrada graciosamente quando o sink de
 * auditoria não suporta consulta (`list` ausente).
 */
export default class AdminDashboardController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    // Total de usuários (página vazia só para ler o `total`).
    const usersPage = await cfg.accountStore.listAccounts({ page: 1, limit: 1 })
    const clientsCount = cfg.clients.length

    // Eventos recentes (best-effort: só se o sink suportar consulta).
    const auditSupported = typeof cfg.audit?.list === 'function'
    const recent = auditSupported ? await cfg.audit!.list!({ page: 1, limit: 5 }) : null

    return render(ctx, 'admin/dashboard', {
      csrfToken: ctx.request.csrfToken,
      usersTotal: usersPage.total,
      clientsCount,
      auditSupported,
      auditTotal: recent?.total ?? 0,
      recentEvents: recent?.data ?? [],
    })
  }
}
