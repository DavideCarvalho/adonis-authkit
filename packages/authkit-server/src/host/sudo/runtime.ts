import { markSudo } from '../sudo_mode.js'
import { accountHome } from '../account_home.js'
import { translate } from '../i18n.js'
import type { SudoContext, SudoMethod } from './types.js'

/** Último método usado com sucesso — só ordena a tela, não restringe nada. */
export const LAST_METHOD_SESSION_KEY = 'authkit_sudo_last_method'

/**
 * ÚNICO ponto do pacote que concede sudo. Nenhum `SudoMethod` chama
 * `markSudo` diretamente: o método decide se verificou, o runtime concede,
 * audita e redireciona.
 */
export async function completeSudo(c: SudoContext, methodId: string): Promise<unknown> {
  markSudo(c.ctx)
  c.ctx.session.put(LAST_METHOD_SESSION_KEY, methodId)

  await c.cfg.audit?.record({
    type: 'sudo.confirmed',
    accountId: c.accountId,
    ip: c.ctx.request.ip?.() ?? null,
    metadata: { method: methodId },
  })

  // Cast pontual: `accountHome` espera `{ accountHome?: string }`, um shape
  // "fraco" (só props opcionais) sem NENHUMA propriedade em comum, na
  // declaração, com `ResolvedServerConfig` — o TS marca isso como TS2559
  // (weak type detection). Achado ao tipar `cfg` honestamente pela primeira
  // vez (os controllers legados nunca type-checavam essa chamada porque
  // `ContainerResolver<any>` faz `service.config` cair em `any`). NÃO é
  // introduzido aqui: `defineConfig()` já não propaga `accountHome` da config
  // de entrada pro objeto resolvido — ver concern no relatório da Task 2.
  return c.ctx.response.redirect(c.returnTo ?? accountHome(c.cfg as { accountHome?: string }))
}

/**
 * Falha de confirmação: flash + volta pro /account/confirm preservando o
 * destino. Substitui a coreografia que estava duplicada cinco vezes no
 * controller.
 */
export async function fail(c: SudoContext, messageKey: string): Promise<unknown> {
  c.ctx.session.flash('confirmError', translate(c.cfg.messages, messageKey))
  const qs = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
  return c.ctx.response.redirect(`/account/confirm${qs}`)
}

/**
 * Filtra os métodos disponíveis para esta conta e promove o último usado.
 *
 * `isAvailable` que lança NÃO derruba a tela: um método quebrado não pode
 * trancar o usuário fora dos outros — mesmo espírito do FAIL-SAFE de
 * `requireSudo`.
 */
export async function resolveAvailableMethods(
  c: SudoContext,
  methods: SudoMethod[]
): Promise<SudoMethod[]> {
  const checked = await Promise.all(
    methods.map(async (m) => {
      try {
        return (await m.isAvailable(c)) ? m : null
      } catch (error) {
        // Fail-safe: um `isAvailable` quebrado não pode trancar o usuário fora
        // dos outros métodos — mas precisa deixar rastro, senão um typo vira
        // um método que some da tela em produção sem ninguém saber por quê.
        // `?.` defensivo: em teste, `fakeSudoContext` pode não ter logger.
        c.ctx.logger?.warn(
          { method: m.id, err: error },
          `authkit: isAvailable() do método de sudo "${m.id}" lançou — método omitido da lista`
        )
        return null
      }
    })
  )

  const available = checked.filter((m): m is SudoMethod => m !== null)
  const last = c.ctx.session.get(LAST_METHOD_SESSION_KEY) as string | undefined
  if (!last) return available

  const preferred = available.filter((m) => m.id === last)
  return preferred.length ? [...preferred, ...available.filter((m) => m.id !== last)] : available
}
