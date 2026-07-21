/**
 * Sudo mode — tela de confirmação de identidade (/account/confirm).
 *
 * O GET lista os métodos DISPONÍVEIS para a conta (SPI `SudoMethod`); a
 * verificação de cada um vive no próprio método, nas rotas que ele registra.
 * Este controller não verifica credencial nem chama `markSudo`.
 *
 * A tela está atrás do `accountGuard` (requer sessão de conta ativa).
 */

import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { validateReturnTo } from './account_session_controller.js'
import {
  resolveAvailableMethods,
  explicitSudoMethods,
  LAST_METHOD_SESSION_KEY,
} from '../sudo/runtime.js'
import type { ResolvedServerConfig } from '../../define_config.js'
import { password } from '../sudo/methods/password.js'
import { passkey } from '../sudo/methods/passkey.js'
import type { SudoContext, SudoMethod } from '../sudo/types.js'

/** Sem config → comportamento histórico. */
export const SUDO_METHOD_DEFAULTS: SudoMethod[] = [password(), passkey()]

/**
 * Ids dos métodos cujas rotas FORAM montadas, preenchido por `registerAuthHost`.
 * Serve só para detectar flag-drift entre `config.sudo.methods` (o que a tela
 * oferece) e o que de fato tem rota.
 */
export const mountedSudoMethodIds = new Set<string>()

/**
 * Lista efetiva de métodos da TELA. Sem config explícito, os defaults.
 *
 * A checagem equivalente do lado dos HANDLERS é `isSudoMethodEnabled`
 * (`../sudo/runtime.js`) — mesma fonte (`explicitSudoMethods`), resposta
 * diferente para o caso "host não configurou nada": aqui os defaults, lá
 * "qualquer método montado vale". Os métodos não podem importar daqui sem criar
 * um ciclo (este módulo importa `password()`/`passkey()`).
 */
export function configuredSudoMethods(cfg: ResolvedServerConfig): SudoMethod[] {
  return explicitSudoMethods(cfg) ?? SUDO_METHOD_DEFAULTS
}

/** Monta o SudoContext a partir do HttpContext. Usado aqui e pelas rotas dos métodos. */
export async function sudoContextFrom(ctx: HttpContext): Promise<SudoContext> {
  const service = await (ctx as any).containerResolver.make('authkit.server')
  const cfg = service.config
  const accountId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
  const account = await cfg.accountStore.findById(accountId)

  // PRECEDÊNCIA do return_to. Num GET a query string é a única fonte real. Num
  // POST o alvo do redirect vem do campo hidden do form: deixar a query string
  // vencer permitiria a um link `?return_to=...` sequestrar o destino de um form
  // que o usuário já preencheu — e seria uma mudança silenciosa de um alvo de
  // redirect em relação ao comportamento histórico (`request.input`, que no
  // Adonis já dá precedência ao corpo). `validateReturnTo` roda nos dois casos.
  const fromBody = ctx.request.input?.('return_to')
  const fromQuery = (ctx.request as any).qs?.()?.return_to
  const isPost = String((ctx.request as any).method?.() ?? '').toUpperCase() === 'POST'
  const raw = isPost ? (fromBody ?? fromQuery) : (fromQuery ?? fromBody)

  return { ctx, cfg, accountId, account, returnTo: validateReturnTo(raw) }
}

export default class AccountConfirmController {
  async show(ctx: HttpContext) {
    const c = await sudoContextFrom(ctx)
    const available = await resolveAvailableMethods(c, configuredSudoMethods(c.cfg))
    const methods = await Promise.all(
      available.map(async (m) => ({ id: m.id, ...(await m.describe(c)) }))
    )

    if (!methods.length) {
      // Nenhum método disponível é erro de CONFIGURAÇÃO do host, não usuário
      // preso: a tela informa e o log aponta o problema.
      ;(ctx as any).logger?.error(
        { accountId: c.accountId },
        'authkit: nenhum método de sudo disponível para a conta — verifique config.sudo.methods'
      )
    }

    // FLAG-DRIFT: `config.sudo.methods` decide o que a tela OFERECE, mas as
    // rotas são montadas em tempo de registro, por `registerAuthHost`. Se as
    // duas listas divergirem, a tela mostra um método cujo endpoint não existe
    // — falha silenciosa e confusa. Avisa alto, uma vez por render.
    for (const m of methods) {
      if (!mountedSudoMethodIds.has(m.id)) {
        ;(ctx as any).logger?.warn(
          { method: m.id },
          `authkit: método de sudo "${m.id}" está em config.sudo.methods mas não teve ` +
            'rotas montadas por registerAuthHost — a tela vai oferecer uma opção cujo ' +
            'endpoint não existe'
        )
      }
    }

    return c.cfg.render!(ctx, 'account/confirm', {
      csrfToken: ctx.request.csrfToken,
      returnTo: c.returnTo,
      error: ctx.session.flashMessages.get('confirmError') ?? null,
      // `confirmNotice` é flashado por `magic_link.ts` ao enviar o link (já
      // traduzido, mesmo padrão de `confirmError`). Sem repassar aqui, quem
      // pede o link volta para a tela sem nenhum feedback de que o e-mail saiu.
      notice: ctx.session.flashMessages.get('confirmNotice') ?? null,
      methods,
      preferredId: ctx.session.get(LAST_METHOD_SESSION_KEY) ?? null,
    })
  }
}
