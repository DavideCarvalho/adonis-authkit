import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { TokenVerifyService } from './token_verify_service.js'
import { AdminSessionsService } from '../admin_sessions_service.js'
import { computeAdminStats } from '../admin_stats_service.js'
import { auditDto, apiError } from './dto.js'

/**
 * Endpoints utilitários da Admin REST API: log de auditoria (`GET /audit`) e
 * introspecção genérica de token (`POST /tokens/verify`).
 */
export default class ApiMiscController {
  /** GET /audit — listagem paginada (501 JSON quando o sink não consulta). */
  async audit(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const sink = cfg.audit
    if (!sink || typeof sink.list !== 'function') {
      return ctx.response
        .status(501)
        .send(apiError('not_implemented', 'O sink de auditoria configurado não suporta consulta.'))
    }
    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1)
    const limit = Math.max(1, Math.min(100, Number.parseInt(ctx.request.input('limit', '20'), 10) || 20))
    const type = (ctx.request.input('type') as string | undefined)?.trim() || undefined
    const subject = (ctx.request.input('subject') as string | undefined)?.trim() || undefined

    const result = await sink.list({ page, limit, type, subject })
    return { data: result.data.map(auditDto), total: result.total, page, limit }
  }

  /** GET /stats — métricas-resumo do IdP (totais + MAU + séries de 30 dias). */
  async stats(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const sessions = new AdminSessionsService(service)
    return computeAdminStats(cfg, sessions)
  }

  /** POST /tokens/verify — { token } → resultado de introspecção (PAT ou opaque AT). */
  async verify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const token = ctx.request.input('token')
    if (!token || typeof token !== 'string') {
      return ctx.response.badRequest(apiError('invalid_request', 'O campo token é obrigatório.'))
    }
    const verifier = new TokenVerifyService(cfg, service.provider)
    return verifier.verify(token)
  }
}
