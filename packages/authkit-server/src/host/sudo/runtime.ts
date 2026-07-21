import { markSudo } from '../sudo_mode.js'
import { accountHome } from '../account_home.js'
import { translate } from '../i18n.js'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { validateReturnTo } from '../controllers/account_session_controller.js'
import type { HttpContext, Router } from '@adonisjs/core/http'
import type { ResolvedServerConfig } from '../../define_config.js'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from './types.js'

/** Último método usado com sucesso — só ordena a tela, não restringe nada. */
export const LAST_METHOD_SESSION_KEY = 'authkit_sudo_last_method'

/**
 * Monta o `SudoContext` a partir do `HttpContext`.
 *
 * Mora AQUI, e não no controller, porque é o construtor canônico do contexto
 * que `completeSudo`/`fail` recebem e que todo `SudoMethod` usa — é runtime do
 * SPI, não detalhe da tela. Enquanto morava em `controllers/`, o barrel do SPI
 * reexportava de lá só para esconder isso, e o ciclo
 * `runtime → controller → runtime` era o que obrigava `configuredSudoMethods` a
 * viver longe de `isSudoMethodEnabled` — origem do drift entre os dois lados.
 */
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

/**
 * Métodos cujas rotas FORAM montadas por `registerAuthHost`, na ordem em que
 * ele as montou. Guarda os OBJETOS, não só os ids, porque esta lista é também
 * a lista efetiva da TELA quando o host não configura `config.sudo.methods` —
 * ver `configuredSudoMethods`.
 */
const mountedSudoMethods: SudoMethod[] = []

/**
 * Registra a lista montada. Chamado UMA vez por `registerAuthHost`, e
 * SUBSTITUI (não acumula): registrar o host de novo é redefinir o que existe,
 * não somar ao que existia.
 */
export function setMountedSudoMethods(methods: SudoMethod[]): void {
  mountedSudoMethods.splice(0, mountedSudoMethods.length, ...methods)
}

/** Um método com este id teve rotas montadas? Usado só para avisar de drift. */
export function isSudoMethodMounted(methodId: string): boolean {
  return mountedSudoMethods.some((m) => m?.id === methodId)
}

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

/**
 * Lista efetiva de métodos da TELA — o irmão de `isSudoMethodEnabled`, e por
 * isso mora coladinho nele.
 *
 * Sem config explícita cai na lista MONTADA, exatamente a mesma resposta que
 * `isSudoMethodEnabled` dá do lado dos handlers ("vale o que tem rota"). Antes
 * caía numa lista de defaults hardcoded, e os dois lados divergiam de verdade:
 * um host que fizesse só
 *
 * ```ts
 * registerAuthHost(router, { sudoMethods: [sudoMethods.magicLink()] })
 * ```
 *
 * montava só magic-link, mas a tela oferecia password + passkey (ambos 404) e
 * NÃO oferecia magic-link, que funcionava. Caindo na lista montada, o drift
 * fica estruturalmente impossível no caso sem config: é literalmente a mesma
 * lista. O aviso de flag-drift do controller passa a valer só para o caso que
 * sobra — config explícita divergindo do que foi montado.
 */
export function configuredSudoMethods(cfg: ResolvedServerConfig): SudoMethod[] {
  return explicitSudoMethods(cfg) ?? mountedSudoMethods
}

/**
 * Verbos HTTP com a forma `(pattern, handler, ...)` — o handler é o SEGUNDO
 * argumento.
 *
 * `route` NÃO entra aqui: sua assinatura é `(pattern, methods, handler)`, com o
 * handler no TERCEIRO argumento, e por isso tem tratamento próprio no Proxy.
 * Deixá-lo de fora da barreira seria um bypass silencioso — `router.route()`
 * registra rota igual a qualquer verbo.
 */
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

  // Só embrulha handler-função. Um `[Controller, 'method']` passa direto:
  // nenhum método built-in registra assim, e embrulhar a tupla a quebraria.
  const wrapIfFn = (handler: unknown) =>
    typeof handler === 'function' ? wrap(handler as (ctx: HttpContext) => unknown) : handler

  return new Proxy(router, {
    // `receiver` é DELIBERADAMENTE `target`, não o Proxy: o `Router` do Adonis é
    // uma classe com campos privados (`#app`, `#globalMatchers`, `#pushToRoutes`),
    // e ler/chamar um membro com `this` apontando para o Proxy lança
    // `TypeError: Cannot read private member #app`.
    get(target, prop) {
      const original = Reflect.get(target, prop, target)
      if (typeof original !== 'function') return original

      // `route(pattern, methods, handler)` — handler no TERCEIRO argumento.
      if (prop === 'route') {
        return (pattern: string, methods: unknown, handler: unknown, ...rest: unknown[]) =>
          original.call(target, pattern, methods, wrapIfFn(handler), ...rest)
      }

      if (ROUTER_VERBS.includes(prop as (typeof ROUTER_VERBS)[number])) {
        return (pattern: string, handler: unknown, ...rest: unknown[]) =>
          original.call(target, pattern, wrapIfFn(handler), ...rest)
      }

      // Todo o RESTO da API do `Router` (`group`, `on`, `where`, `use`,
      // `resource`, ...) segue funcionando, ligado ao router real. Sem o
      // `bind`, um `router.group(() => ...)` — uso perfeitamente legítimo do
      // tipo `Router` que `SudoMethod.register` declara receber — rodaria com
      // `this === Proxy` e explodiria no boot da aplicação.
      //
      // `original.call(target, ...)` nos verbos e o `bind` aqui preservam o
      // RETORNO real (`Route`/`RouteGroup`), então `.as()`/`.use()`/
      // `.middleware()`/`.prefix()` continuam encadeando normalmente.
      return original.bind(target)
    },
  })
}

/**
 * ÚNICO ponto do pacote que concede sudo. Nenhum `SudoMethod` chama
 * `markSudo` diretamente: o método decide se verificou, o runtime concede,
 * audita e redireciona.
 */
export async function completeSudo(c: SudoContext, methodId: string): Promise<unknown> {
  // SEGUNDA barreira estrutural, irmã de `guardSudoRoutes`: aquela cobre
  // "o método está habilitado?", esta cobre "a conta existe?".
  //
  // `sudoContextFrom` deixa `account: null` quando `findById` não acha nada —
  // sessão viva de conta apagada ou anonimizada. Cada built-in já checa por
  // dentro, mas depender disso é a mesma falha que `guardSudoRoutes` existe
  // para eliminar do outro lado: o PRIMEIRO método desatento que fizer
  // `contextFrom` → `completeSudo` concederia sudo sobre uma conta que não
  // existe mais, e nada detectaria. A garantia tem de estar aqui, no único
  // ponto de concessão.
  // Falsy, não `=== null`: um contexto montado à mão que simplesmente omita
  // `account` não pode escapar da barreira por um detalhe de forma.
  if (!c.account) return fail(c, 'account.confirm.error')

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
