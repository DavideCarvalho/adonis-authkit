import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { resolveRuntimeSettings } from '../runtime_settings.js'
import { apiError } from '../admin_api/dto.js'
import { buildKeysStatus, rotateNow } from '../key_rotation_actions.js'

function notSupported(ctx: HttpContext) {
  return ctx.response
    .status(501)
    .send(apiError('not_implemented', 'jwks não é managed+store.'))
}

/**
 * Endpoints JSON de gestão da chave de assinatura managed para o console admin React.
 *
 * GET    {prefix}/api/keys          → status da chave (idade + política + ETA)
 * POST   {prefix}/api/keys/rotate   → rotaciona agora; body: { retire?, keep? }
 *
 * Autenticado por sessão + admin role (adminGuard upstream, NÃO Bearer).
 * Retorna 501 (`not_implemented`) quando o jwks não é managed+store.
 * Espelha a lógica da Admin REST API (api_keys_controller) reutilizando os
 * helpers compartilhados buildKeysStatus/rotateNow de key_rotation_actions.
 */
export default class ConsoleKeysController {
  /** GET {prefix}/api/keys — status da chave de assinatura managed (idade + política + ETA). */
  async status(ctx: HttpContext) {
    const svc: any = await ctx.containerResolver.make('authkit.server')
    // RuntimeSettings é opcional (tabela auth_settings ausente → política default).
    const settings = await resolveRuntimeSettings(ctx)
    const status = await buildKeysStatus(svc, settings)
    if (!status) return notSupported(ctx)
    return status
  }

  /** POST {prefix}/api/keys/rotate — { retire?, keep? } → rotaciona agora. */
  async rotate(ctx: HttpContext) {
    const svc: any = await ctx.containerResolver.make('authkit.server')
    if (
      typeof svc.rotateKeys !== 'function' ||
      (await svc.keystoreAgeDays?.().catch(() => null)) === null
    ) {
      return notSupported(ctx)
    }
    return rotateNow(svc, ctx.request.body() as any)
  }
}
