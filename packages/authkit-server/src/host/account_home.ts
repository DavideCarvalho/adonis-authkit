/**
 * Destino default da área da conta (pós-login do console sem `return_to`,
 * confirmações de e-mail, fallback de redirects).
 *
 * Configurável via `accountHome` no defineConfig; default '/account/security'
 * (a "minha conta" natural — perfil, senha, sessões). Nunca '/account/tokens':
 * aterrissar usuário comum numa tela de Personal Access Tokens é hostil.
 */
export function accountHome(cfg: { accountHome?: string }): string {
  return cfg.accountHome ?? '/account/security';
}
