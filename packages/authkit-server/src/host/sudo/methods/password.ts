import type { Router } from '@adonisjs/core/http'
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js'

/**
 * Confirmação por senha — o método histórico.
 *
 * URL LEGADA: registra `POST /account/confirm` (não `/account/confirm/password`),
 * porque `src/host/views/account/confirm.edge:21` posta nesse path literal.
 * É também a razão de `register` receber o router cru em vez de o runtime
 * montar por convenção a partir do `id`.
 *
 * LIMITAÇÃO CONHECIDA de `isAvailable`: ele responde "a conta tem hash?", não
 * "o usuário conhece a senha?". Host que cria contas passwordless gravando um
 * hash aleatório para satisfazer uma coluna NOT NULL verá este método como
 * disponível e mostrará um campo que ninguém consegue preencher. De dentro do
 * pacote, hash aleatório e hash real são indistinguíveis; a correção é do host
 * (coluna nullable) ou basta omitir `password()` da lista de `methods`.
 */
export function password(): SudoMethod {
  return {
    id: 'password',

    async isAvailable(c: SudoContext) {
      try {
        // `__getRawRow` não faz parte do contrato público de `AccountStore` (é um
        // escape hatch interno do store Lucid) — mesmo cast usado nos demais
        // pontos do pacote que a consomem (ex.: account_security_controller.ts).
        const row = await (c.cfg.accountStore as any).__getRawRow?.(c.accountId)
        return Boolean(row?.password)
      } catch {
        return false
      }
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.password',
        kind: 'form' as const,
        endpoint: '/account/confirm',
        fields: [
          { name: 'password', type: 'password' as const, labelKey: 'account.confirm.password_label' },
        ],
      }
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm', async (ctx: any) => {
        const c = await h.contextFrom(ctx)
        const { password: submitted } = ctx.request.only(['password'])

        // `c.account.email` é `string | null` no tipo do SPI (contas sem e-mail
        // são possíveis em tese); sem e-mail não há como verificar credenciais.
        if (!submitted || !c.account || !c.account.email) return h.fail(c, 'account.confirm.error')

        const ok = await c.cfg.accountStore.verifyCredentials(c.account.email, submitted)
        if (!ok) return h.fail(c, 'account.confirm.error')

        return h.completeSudo(c, 'password')
      })
    },
  }
}
