import type { Router } from '@adonisjs/core/http'
import { isSudoMethodEnabled } from '../runtime.js'
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

    /**
     * Fallback conservador herdado de `isPasswordless` (o original em
     * `account_confirm_controller.ts`): sem informação, assumimos que a conta
     * TEM senha.
     *
     * `__getRawRow` não faz parte do contrato público de `AccountStore` — é um
     * escape hatch interno do store Lucid (mesmo cast usado em outros pontos do
     * pacote, ex.: account_security_controller.ts). Um `AccountStore` do SPI
     * (o público-alvo deste método) não é obrigado a implementá-lo. Se
     * tratássemos "não sei" como indisponível, um store customizado sem esse
     * escape hatch perderia o método `password` mesmo com `verifyCredentials`
     * funcionando — e, sem passkey também, o usuário fica sem nenhum método e
     * travado fora do sudo mode. Por isso os três casos abaixo:
     *
     * - `__getRawRow` ausente (`undefined`) → disponível (não sabemos, não escondemos).
     * - Presente e devolve hash não-vazio → disponível.
     * - Presente e devolve hash vazio/nulo (ou linha nula) → indisponível (sabemos que não há senha).
     * - Lança exceção → disponível (mesmo espírito conservador: não sabemos).
     *
     * Esconder o método é sempre pior que mostrá-lo: uma opção visível que
     * falha é recuperável (o usuário tenta e escolhe outra); uma opção
     * escondida não é nem descobrível.
     */
    async isAvailable(c: SudoContext) {
      const getRawRow = (c.cfg.accountStore as any).__getRawRow
      if (typeof getRawRow !== 'function') return true

      try {
        const row = await getRawRow.call(c.cfg.accountStore, c.accountId)
        // Store expõe a função e respondeu (linha nula ou hash vazio/nulo): sabemos
        // que não há senha → indisponível.
        return Boolean(row?.password)
      } catch {
        return true
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

        // ANTES de qualquer verificação: o host desligou este método?
        // A rota é montada incondicionalmente (decisão de tempo de registro),
        // então `config.sudo.methods` só desabilita de fato se o handler
        // recusar. Responde `fail` — o mesmo redirect+flash de uma senha
        // errada — em vez de 404: assim a resposta não distingue "método
        // desligado" de "senha incorreta" e não vaza a config do host.
        if (!isSudoMethodEnabled(c.cfg, 'password')) return h.fail(c, 'account.confirm.error')

        const { password: submitted } = ctx.request.only(['password'])

        // `c.account` é nullable (sessão viva de conta apagada → findById null)
        // e `email` pode vir vazio de um store customizado; sem e-mail não há
        // como verificar credenciais.
        if (!submitted || !c.account || !c.account.email) return h.fail(c, 'account.confirm.error')

        const ok = await c.cfg.accountStore.verifyCredentials(c.account.email, submitted)
        if (!ok) return h.fail(c, 'account.confirm.error')

        return h.completeSudo(c, 'password')
      })
    },
  }
}
