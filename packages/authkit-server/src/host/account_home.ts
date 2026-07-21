/**
 * Destino default da área da conta (pós-login do console sem `return_to`,
 * confirmações de e-mail, fallback de redirects).
 *
 * Configurável via `accountHome` no defineConfig; default `accountPath('security')`
 * (a "minha conta" natural — perfil, senha, sessões; `/account/security`, ou
 * `/conta/seguranca` com overrides). Nunca a tela de tokens: aterrissar usuário
 * comum numa tela de Personal Access Tokens é hostil.
 */
import { accountPath } from './account_paths.js';

export function accountHome(cfg: { accountHome?: string }): string {
  return cfg.accountHome ?? accountPath('security');
}
