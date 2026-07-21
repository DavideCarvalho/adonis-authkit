import '../augmentations.js';
import type { HttpContext } from '@adonisjs/core/http';
import { apiError, auditDto } from '../admin_api/dto.js';

/**
 * Endpoints JSON do log de auditoria do console admin React.
 *
 * GET {prefix}/api/audit?type=&page=&limit=  → listagem paginada
 *
 * 404 honesto (`capability_unsupported`) quando o sink não suporta consulta.
 */
export default class ConsoleAuditController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server');
    const cfg = service.config;

    const sink = cfg.audit;
    if (!sink || typeof sink.list !== 'function') {
      return ctx.response.notFound(
        apiError('capability_unsupported', 'O sink de auditoria configurado não suporta consulta.'),
      );
    }

    const page = Math.max(1, Number.parseInt(ctx.request.input('page', '1'), 10) || 1);
    const limit = Math.max(
      1,
      Math.min(100, Number.parseInt(ctx.request.input('limit', '20'), 10) || 20),
    );
    const type = (ctx.request.input('type') as string | undefined)?.trim() || undefined;
    const subject = (ctx.request.input('subject') as string | undefined)?.trim() || undefined;

    const result = await sink.list({ page, limit, type, subject });
    return { data: result.data.map(auditDto), total: result.total, page, limit };
  }
}
