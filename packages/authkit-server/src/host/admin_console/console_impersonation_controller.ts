import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { buildImpersonationPanel } from '../impersonation.js'
import { apiError } from '../admin_api/dto.js'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'

/**
 * Endpoint JSON do painel de impersonation do console admin React.
 *
 * GET {prefix}/api/impersonation/:userId
 *
 * Retorna os parâmetros RFC 8693 (token exchange) para o admin assumir a
 * identidade de um usuário-alvo. 404 quando impersonation está desabilitado na
 * config ou quando nenhum client tem o grant token-exchange habilitado.
 */
export default class ConsoleImpersonationController {
  async handle(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config

    // Impersonation precisa estar explicitamente habilitado no config.
    if (!cfg.admin.impersonation) {
      return ctx.response.notFound(
        apiError('capability_unsupported', 'Impersonation não está habilitado nesta instalação.')
      )
    }

    const targetId = ctx.request.param('userId') as string
    const account = await cfg.accountStore.findById(targetId)
    if (!account) {
      return ctx.response.notFound(apiError('not_found', 'Usuário não encontrado.'))
    }

    const panel = buildImpersonationPanel(cfg, targetId)
    if (!panel) {
      return ctx.response.notFound(
        apiError(
          'no_token_exchange_client',
          'Nenhum client habilitado ao grant token-exchange encontrado.'
        )
      )
    }

    // Auditoria: acessar o painel é uma intenção de impersonation.
    await cfg.audit?.record({
      type: 'impersonation.started',
      accountId: targetId,
      actorId: (ctx.session?.get(ACCOUNT_SESSION_KEY) as string) ?? null,
      ip: ctx.request.ip?.() ?? null,
      metadata: { clientId: panel.clientId, channel: 'admin-console' },
    })

    return {
      targetUserId: targetId,
      targetEmail: account.email,
      ...panel,
    }
  }
}
