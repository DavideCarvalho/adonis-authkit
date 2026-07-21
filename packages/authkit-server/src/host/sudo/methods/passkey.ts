import type { Router } from '@adonisjs/core/http'
import { supportsPasskeys } from '../../../accounts/account_store.js'
import { translate } from '../../i18n.js'
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
        const generated = await c.cfg.accountStore.generatePasskeyAuthenticationOptions?.(c.accountId)
        if (!generated) {
          // i18n: mesma chave usada pelo controller original — hosts com catálogo
          // customizado (ex.: pt-BR) não podem perder a mensagem localizada aqui.
          return ctx.response.notFound({ message: translate(c.cfg.messages, 'errors.no_passkey_registered') })
        }
        ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_KEY, generated.challenge)
        return generated.options
      })

      router.post('/account/confirm/passkey', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
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
