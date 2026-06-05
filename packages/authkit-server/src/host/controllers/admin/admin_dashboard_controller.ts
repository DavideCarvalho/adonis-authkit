import '../../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminSessionsService } from '../../admin_sessions_service.js'
import { computeAdminStats } from '../../admin_stats_service.js'
import { barChartSvg } from '../../svg_chart.js'
import { getAdminPrefix } from '../../admin_prefix.js'

/**
 * Dashboard do console admin: métricas-resumo (usuários, sessões ativas, MAU,
 * sign-ins/sign-ups) + gráficos SVG inline (server-side) das séries de 30 dias + os
 * eventos de auditoria mais recentes. Degrada graciosamente quando o sink de
 * auditoria não suporta consulta (`list` ausente) e quando o adapter não enumera
 * sessões.
 */
export default class AdminDashboardController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const sessions = new AdminSessionsService(service)
    const stats = await computeAdminStats(cfg, sessions)
    const clientsCount = cfg.clients.length

    // Eventos recentes (best-effort: só se o sink suportar consulta).
    const recent =
      typeof cfg.audit?.list === 'function' ? await cfg.audit.list({ page: 1, limit: 5 }) : null

    return render(ctx, 'admin/dashboard', {
      csrfToken: ctx.request.csrfToken,
      adminBase: getAdminPrefix(),
      usersTotal: stats.totalUsers,
      activeSessions: stats.activeSessions,
      mau: stats.mau,
      signInsTotal: stats.signInsTotal,
      signUpsTotal: stats.signUpsTotal,
      windowDays: stats.windowDays,
      clientsCount,
      auditSupported: stats.auditSupported,
      // Gráficos SVG gerados no servidor (sem lib JS).
      signInsChart: barChartSvg(stats.signInsPerDay, { color: '#111827' }),
      signUpsChart: barChartSvg(stats.signUpsPerDay, { color: '#2563eb' }),
      auditTotal: recent?.total ?? 0,
      recentEvents: recent?.data ?? [],
    })
  }
}
