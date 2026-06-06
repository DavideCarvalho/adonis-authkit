import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { AdminOrgsService } from '../admin_api/admin_orgs_service.js'
import { orgDto, orgDetailDto, apiError } from '../admin_api/dto.js'

/**
 * Endpoints JSON de organizações do console admin React.
 * 404 honesto quando o store não suporta organizações (`capability_unsupported`).
 *
 * GET {prefix}/api/orgs              → lista orgs com contagem de membros
 * GET {prefix}/api/orgs/:id          → detalhe da org (membros + convites)
 */
export default class ConsoleOrgsController {
  /** GET {prefix}/api/orgs */
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const svc = new AdminOrgsService(service.config)

    if (!svc.supported) {
      return ctx.response.notFound(
        apiError('capability_unsupported', 'O store não suporta organizações.')
      )
    }

    const result = await svc.listOrgs()
    if (!Array.isArray(result)) {
      return ctx.response.notFound(
        apiError('capability_unsupported', 'O store não suporta organizações.')
      )
    }

    return { data: result.map((o) => orgDto(o)) }
  }

  /** GET {prefix}/api/orgs/:id */
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const svc = new AdminOrgsService(service.config)

    if (!svc.supported) {
      return ctx.response.notFound(
        apiError('capability_unsupported', 'O store não suporta organizações.')
      )
    }

    const id = ctx.request.param('id') as string
    const result = await svc.getOrg(id)

    if ('ok' in result && result.ok === false) {
      if (result.reason === 'not_found') {
        return ctx.response.notFound(apiError('not_found', 'Organização não encontrada.'))
      }
      return ctx.response.notFound(
        apiError('capability_unsupported', 'O store não suporta organizações.')
      )
    }

    return orgDetailDto(result as any)
  }
}
