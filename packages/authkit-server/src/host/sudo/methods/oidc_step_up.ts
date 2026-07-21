import type { SudoContext, SudoMethod } from '../types.js'

export interface OidcStepUpOptions {
  /** Rota do HOST que inicia a reautenticação. Ex.: '/auth/step-up'. */
  url: string
}

/**
 * Confirmação por reautenticação OIDC (step-up), o mecanismo padrão do próprio
 * protocolo para provar identidade recente (`prompt=login` / `max_age`).
 *
 * SEMPRE disponível: é o único método que não exige nada previamente
 * cadastrado, e por isso é o que quebra o deadlock de hosts passwordless —
 * onde o usuário não tem senha e cadastrar passkey também exigiria sudo.
 *
 * NÃO registra rotas: o fluxo sai do pacote. Quem chama `completeSudo` é o
 * host, no seu callback, DEPOIS de validar o grant.
 *
 * Fluxo esperado do host:
 *
 * ```
 * POST /account/security/export
 *   requireSudo() → sem marca → redirect para este endpoint
 * GET  /auth/step-up
 *   grava flag de step-up NA SESSÃO; inicia Authorization Code + PKCE
 *   com prompt=login
 * GET  /auth/callback
 *   valida state/PKCE/nonce; vê a flag; chama completeSudo(); limpa a flag
 * ```
 *
 * Duas regras que o host PRECISA seguir:
 *
 * 1. A flag de step-up vive NA SESSÃO, nunca na querystring. Se trafegasse
 *    pela URL, qualquer um forjaria um callback que concede sudo.
 * 2. `completeSudo` só DEPOIS da validação completa do grant. É o
 *    `prompt=login` que garante que o provider forçou reautenticação, em vez
 *    de reaproveitar a sessão existente.
 */
export function oidcStepUp(opts: OidcStepUpOptions): SudoMethod {
  return {
    id: 'oidc-step-up',

    async isAvailable() {
      return true
    },

    async describe(c: SudoContext) {
      const qs = c.returnTo ? `?return_to=${encodeURIComponent(c.returnTo)}` : ''
      return {
        labelKey: 'account.confirm.method.oidc_step_up',
        kind: 'redirect' as const,
        endpoint: `${opts.url}${qs}`,
      }
    },
  }
}
