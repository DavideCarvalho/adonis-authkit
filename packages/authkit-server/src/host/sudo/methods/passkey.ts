import type { Router } from '@adonisjs/core/http'
import { supportsPasskeys } from '../../../accounts/account_store.js'
import { translate } from '../../i18n.js'
import { isSudoMethodEnabled } from '../runtime.js'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js'

/** Chave de sessão do challenge — preservada do controller original. */
export const CONFIRM_PASSKEY_CHALLENGE_KEY = 'authkit_confirm_passkey_challenge'

/**
 * Confirmação por passkey (WebAuthn).
 *
 * URLs LEGADAS preservadas: `/account/confirm/passkey/options` e
 * `/account/confirm/passkey`. O JS embutido em `confirm.edge:52,59` chama esses
 * paths literalmente.
 */
export function passkey(): SudoMethod {
  return {
    id: 'passkey',

    async isAvailable(c: SudoContext) {
      if (!supportsPasskeys(c.cfg.accountStore)) return false
      const list = await c.cfg.accountStore.listPasskeys(c.accountId)
      return list.length > 0
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.passkey',
        kind: 'action' as const,
        endpoint: '/account/confirm/passkey',
      }
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm/passkey/options', async (ctx: any) => {
        const c = await h.contextFrom(ctx)

        // i18n: mesma chave usada pelo controller original — hosts com catálogo
        // customizado (ex.: pt-BR) não podem perder a mensagem localizada aqui.
        // Reusada nas TRÊS recusas abaixo de propósito: "método desligado",
        // "conta inexistente" e "sem passkey" ficam indistinguíveis para o
        // chamador.
        const deny = () =>
          ctx.response.notFound({ message: translate(c.cfg.messages, 'errors.no_passkey_registered') })

        // ANTES de qualquer coisa: o host desligou este método? A rota é montada
        // incondicionalmente, então só o handler faz `config.sudo.methods` valer.
        if (!isSudoMethodEnabled(c.cfg, 'passkey')) return deny()

        // Sem conta resolvida não há a quem emitir challenge. Aqui NÃO usamos
        // `h.fail` (que redireciona) porque este endpoint é XHR e devolve JSON —
        // um 302 para HTML quebraria o cliente. 404 em vez de 401 porque o 401
        // afirmaria "você não está autenticado", informação a mais que o
        // endpoint não precisa dar e incoerente com o resto do console, onde a
        // ausência de sessão é tratada por redirect no `accountGuard`; o 404 é
        // literalmente a resposta que este mesmo handler já dá quando não há
        // passkey, então os casos não se distinguem.
        if (!c.account) return deny()

        const generated = await c.cfg.accountStore.generatePasskeyAuthenticationOptions?.(c.accountId)
        if (!generated) return deny()

        ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_KEY, generated.challenge)
        return generated.options
      })

      router.post('/account/confirm/passkey', async (ctx: any) => {
        const c = await h.contextFrom(ctx)

        // Método desligado pelo host → mesma resposta de uma assertion inválida
        // (redirect + flash), para não vazar a config.
        if (!isSudoMethodEnabled(c.cfg, 'passkey')) return h.fail(c, 'account.confirm.passkey_error')

        // A conta PRECISA existir. Sem esta linha, as únicas barreiras seriam o
        // challenge na sessão e `verifyPasskeyAuthentication(c.accountId, ...)`:
        // um `AccountStore` que resolva a credencial pelo `rawId` (fluxo
        // discoverable/usernameless, comum em WebAuthn) aceitaria uma assertion
        // com `accountId: undefined` e chegaria a `completeSudo` sem conta.
        if (!c.account) return h.fail(c, 'account.confirm.passkey_error')

        const challenge = ctx.session.get(CONFIRM_PASSKEY_CHALLENGE_KEY) as string | undefined
        if (!challenge) return h.fail(c, 'account.confirm.passkey_error')

        const raw = ctx.request.input('response') as string | undefined
        let parsed: unknown = null
        try {
          parsed = raw ? JSON.parse(raw) : null
        } catch {
          parsed = null
        }

        const ok = parsed
          ? ((await c.cfg.accountStore.verifyPasskeyAuthentication?.(c.accountId, parsed, challenge)) ?? false)
          : false

        ctx.session.forget(CONFIRM_PASSKEY_CHALLENGE_KEY)
        if (!ok) return h.fail(c, 'account.confirm.passkey_error')

        return h.completeSudo(c, 'passkey')
      })
    },
  }
}
