import type { Router } from '@adonisjs/core/http';
import { supportsPasskeys } from '../../../accounts/account_store.js';
import { translate } from '../../i18n.js';
import { isSudoMethodEnabled } from '../runtime.js';
import type { SudoContext, SudoMethod, SudoRouteHelpers } from '../types.js';

/** Chave de sessão do challenge — preservada do controller original. */
export const CONFIRM_PASSKEY_CHALLENGE_KEY = 'authkit_confirm_passkey_challenge';

/**
 * Conta que PEDIU o challenge acima.
 *
 * Mesma exposição do magic link de sudo: a sessão sobrevive à troca de conta —
 * o `regenerate()` do logout só troca o id do cookie e MIGRA os dados. Num
 * navegador compartilhado, A pede o challenge, faz logout, B loga, e o
 * challenge de A continua lá; sem esta vinculação a assertion de A seria
 * verificada CONTRA A CONTA DE B (relevante sobretudo em `AccountStore`
 * discoverable/usernameless, que resolve a credencial pelo `rawId`).
 *
 * Chave SEPARADA de propósito: o valor de `CONFIRM_PASSKEY_CHALLENGE_KEY` é
 * uma string e isso é contratual (pinado em
 * `tests/host/account_confirm_controller.spec.ts`), então a vinculação é
 * aditiva em vez de mudar a forma do valor pinado.
 */
export const CONFIRM_PASSKEY_CHALLENGE_ACCOUNT_KEY = 'authkit_confirm_passkey_challenge_account';

/**
 * Confirmação por passkey (WebAuthn).
 *
 * URLs LEGADAS preservadas: `/account/confirm/passkey/options` e
 * `/account/confirm/passkey`. Hosts externos e telas customizadas (fora deste
 * pacote) dependem desses paths — trocá-los quebraria essas integrações sem
 * que o pacote tenha como saber ou migrar por elas.
 */
export function passkey(): SudoMethod {
  return {
    id: 'passkey',

    async isAvailable(c: SudoContext) {
      if (!supportsPasskeys(c.cfg.accountStore)) return false;
      const list = await c.cfg.accountStore.listPasskeys(c.accountId);
      return list.length > 0;
    },

    async describe() {
      return {
        labelKey: 'account.confirm.method.passkey',
        // 'webauthn', NÃO 'action': o navegador precisa assinar o challenge
        // (`navigator.credentials.get`) ANTES do POST. Um form de submit direto
        // manda `response` vazio e o handler abaixo recusa sempre. O kind é o
        // que faz a tela rodar o handshake — e o endpoint de options ela deriva
        // daqui (`${endpoint}/options`), sem conhecer o id 'passkey'.
        kind: 'webauthn' as const,
        endpoint: '/account/confirm/passkey',
      };
    },

    register(router: Router, h: SudoRouteHelpers) {
      router.post('/account/confirm/passkey/options', async (ctx: any) => {
        const c = await h.contextFrom(ctx);

        // i18n: mesma chave usada pelo controller original — hosts com catálogo
        // customizado (ex.: pt-BR) não podem perder a mensagem localizada aqui.
        // Reusada nas TRÊS recusas abaixo de propósito: "método desligado",
        // "conta inexistente" e "sem passkey" ficam indistinguíveis para o
        // chamador.
        const deny = () =>
          ctx.response.notFound({
            message: translate(c.cfg.messages, 'errors.no_passkey_registered'),
          });

        // ANTES de qualquer coisa: o host desligou este método? A rota é montada
        // incondicionalmente, então só o handler faz `config.sudo.methods` valer.
        if (!isSudoMethodEnabled(c.cfg, 'passkey')) return deny();

        // Sem conta resolvida não há a quem emitir challenge. Aqui NÃO usamos
        // `h.fail` (que redireciona) porque este endpoint é XHR e devolve JSON —
        // um 302 para HTML quebraria o cliente. 404 em vez de 401 porque o 401
        // afirmaria "você não está autenticado", informação a mais que o
        // endpoint não precisa dar e incoerente com o resto do console, onde a
        // ausência de sessão é tratada por redirect no `accountGuard`; o 404 é
        // literalmente a resposta que este mesmo handler já dá quando não há
        // passkey, então os casos não se distinguem.
        if (!c.account) return deny();

        const generated = await c.cfg.accountStore.generatePasskeyAuthenticationOptions?.(
          c.accountId,
        );
        if (!generated) return deny();

        ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_KEY, generated.challenge);
        // Vinculação à conta emissora — ver CONFIRM_PASSKEY_CHALLENGE_ACCOUNT_KEY.
        ctx.session.put(CONFIRM_PASSKEY_CHALLENGE_ACCOUNT_KEY, c.accountId);
        return generated.options;
      });

      router.post('/account/confirm/passkey', async (ctx: any) => {
        const c = await h.contextFrom(ctx);

        // Método desligado pelo host → mesma resposta de uma assertion inválida
        // (redirect + flash), para não vazar a config.
        if (!isSudoMethodEnabled(c.cfg, 'passkey'))
          return h.fail(c, 'account.confirm.passkey_error');

        // A conta PRECISA existir. Sem esta linha, as únicas barreiras seriam o
        // challenge na sessão e `verifyPasskeyAuthentication(c.accountId, ...)`:
        // um `AccountStore` que resolva a credencial pelo `rawId` (fluxo
        // discoverable/usernameless, comum em WebAuthn) aceitaria uma assertion
        // com `accountId: undefined` e chegaria a `completeSudo` sem conta.
        if (!c.account) return h.fail(c, 'account.confirm.passkey_error');

        // Apaga challenge E vinculação juntos: são um par, e meio par na sessão
        // é o começo de um estado que ninguém sabe interpretar depois.
        const clearChallenge = () => {
          ctx.session.forget(CONFIRM_PASSKEY_CHALLENGE_KEY);
          ctx.session.forget(CONFIRM_PASSKEY_CHALLENGE_ACCOUNT_KEY);
        };

        const challenge = ctx.session.get(CONFIRM_PASSKEY_CHALLENGE_KEY) as string | undefined;
        if (!challenge) {
          clearChallenge();
          return h.fail(c, 'account.confirm.passkey_error');
        }

        // VINCULAÇÃO À CONTA: quem consome o challenge tem de ser quem o pediu.
        // "Está pendente nesta sessão" NÃO implica "é desta conta" — a sessão
        // sobrevive ao logout+login de outra conta no mesmo navegador.
        //
        // ESTRITO (fail-closed): challenge SEM vinculação também é recusado. O
        // emissor deste pacote sempre grava o par, então um challenge solto na
        // sessão só pode vir de uma sessão anterior (outra versão do pacote, ou
        // escrita por fora) — e é exatamente essa a forma que o atacante do
        // navegador compartilhado consegue deixar para trás. Aceitar `undefined`
        // seria fail-open: bastaria apagar a vinculação para anular a barreira.
        const boundTo = ctx.session.get(CONFIRM_PASSKEY_CHALLENGE_ACCOUNT_KEY) as
          | string
          | undefined;
        if (boundTo === undefined || boundTo !== c.accountId) {
          clearChallenge();
          return h.fail(c, 'account.confirm.passkey_error');
        }

        const raw = ctx.request.input('response') as string | undefined;
        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }

        const ok = parsed
          ? ((await c.cfg.accountStore.verifyPasskeyAuthentication?.(
              c.accountId,
              parsed,
              challenge,
            )) ?? false)
          : false;

        clearChallenge();
        if (!ok) return h.fail(c, 'account.confirm.passkey_error');

        return h.completeSudo(c, 'passkey');
      });
    },
  };
}
