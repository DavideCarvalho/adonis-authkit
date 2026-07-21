import { markSudo } from '../sudo_mode.js'
import { accountHome } from '../account_home.js'
import { translate } from '../i18n.js'
import type { HttpContext, Router } from '@adonisjs/core/http'
import type { ResolvedServerConfig } from '../../define_config.js'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from './types.js'

/** Último método usado com sucesso — só ordena a tela, não restringe nada. */
export const LAST_METHOD_SESSION_KEY = 'authkit_sudo_last_method'

/**
 * Lista de métodos que o host configurou EXPLICITAMENTE, ou `null` quando ele
 * não configurou nada (ausente ou vazio → "não restringi").
 *
 * Ponto ÚNICO de leitura de `config.sudo.methods`. Existe aqui (e não no
 * controller) porque quem precisa dela são os dois lados — a tela, que decide o
 * que OFERECER, e os handlers dos métodos, que decidem o que ACEITAR — e o
 * controller já importa os métodos built-in, o que tornaria a dependência
 * circular se os métodos importassem de volta o controller.
 */
export function explicitSudoMethods(cfg: ResolvedServerConfig): SudoMethod[] | null {
  const configured = cfg?.sudo?.methods
  return Array.isArray(configured) && configured.length ? configured : null
}

/**
 * O método `methodId` está habilitado para ESTE host?
 *
 * Toda rota registrada por um `SudoMethod` DEVE começar por aqui. Sem essa
 * checagem, `config.sudo.methods` só esconderia o método da tela: o endpoint
 * continuaria vivo e concedendo sudo — uma config que aparenta restringir e não
 * restringe é pior que nenhuma config.
 *
 * Sem configuração explícita nada foi restringido: vale o que tem rota montada.
 * Isso é deliberado — a lista de defaults não é a fonte de verdade do que está
 * montado, e tratá-la como tal derrubaria um método customizado do host.
 */
export function isSudoMethodEnabled(cfg: ResolvedServerConfig, methodId: string): boolean {
  const explicit = explicitSudoMethods(cfg)
  if (explicit === null) return true
  return explicit.some((m) => m?.id === methodId)
}

/** Verbos HTTP que um `SudoMethod` pode usar ao registrar suas rotas. */
const ROUTER_VERBS = ['get', 'post', 'put', 'patch', 'delete', 'any'] as const

/**
 * Envelopa o router entregue a `method.register` para que TODO handler que ele
 * registrar seja barrado quando `config.sudo.methods` não incluir o método.
 *
 * POR QUE NO PONTO DE REGISTRO, e não dentro de cada handler: a barreira é a
 * diferença entre uma config que restringe e uma que só esconde a opção da tela
 * enquanto o endpoint segue concedendo sudo (falha Critical). Deixá-la a cargo
 * de quem escreve o método significa que o PRIMEIRO método que esquecer a
 * chamada reabre a falha — e nada detecta. Aqui a garantia é estrutural: o
 * método não tem como registrar uma rota desguardada, porque não é ele quem
 * segura o router.
 *
 * Os built-in CONTINUAM checando por dentro, e isso não é redundância inútil:
 * cada um recusa na forma que o seu endpoint exige (o `passkey/options` é XHR e
 * devolve JSON 404; um 302 para HTML quebraria o cliente). Este envelope é o
 * piso genérico — recusa com `fail`, o mesmo redirect+flash de um erro comum,
 * que não distingue "método desligado" de "credencial errada" e portanto não
 * vaza a config do host.
 *
 * CUSTO: resolve o config do container antes do handler. Não usa
 * `contextFrom` no caminho feliz de propósito — aquilo faz `findById`, e pagar
 * uma leitura de conta a mais em toda rota de sudo para uma checagem que só lê
 * a config seria desperdício. O contexto completo só é montado para recusar.
 */
export function guardSudoRoutes(router: Router, methodId: string, h: SudoRouteHelpers): Router {
  const wrap =
    (handler: (ctx: HttpContext) => unknown) =>
    async (ctx: HttpContext): Promise<unknown> => {
      const service = await (ctx as any).containerResolver.make('authkit.server')
      if (isSudoMethodEnabled(service.config, methodId)) return handler(ctx)

      const c = await h.contextFrom(ctx)
      return h.fail(c, 'account.confirm.error')
    }

  return new Proxy(router, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver)
      if (!ROUTER_VERBS.includes(prop as (typeof ROUTER_VERBS)[number])) return original
      if (typeof original !== 'function') return original

      return (pattern: string, handler: unknown, ...rest: unknown[]) =>
        // Só embrulha handler-função. Um `[Controller, 'method']` passa direto:
        // nenhum método built-in registra assim, e embrulhar a tupla a quebraria.
        original.call(
          target,
          pattern,
          typeof handler === 'function' ? wrap(handler as (ctx: HttpContext) => unknown) : handler,
          ...rest
        )
    },
  })
}

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

  return c.ctx.response.redirect(c.returnTo ?? accountHome(c.cfg))
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
