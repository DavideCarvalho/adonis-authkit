import type { ResolvedServerConfig } from '../define_config.js';

const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/**
 * Parâmetros PRONTOS do RFC 8693 Token Exchange para o admin assumir a identidade
 * de um usuário-alvo. NÃO é um bypass de auth: o exchange real (no
 * `token_endpoint`) exige um access token do PRÓPRIO admin como `subject_token`
 * (que o handler valida ter a role admin) e um client habilitado ao grant
 * token-exchange. O painel só monta os parâmetros + um curl pronto — honesto com
 * o mecanismo que já existe em `provider/token_exchange.ts`.
 */
export interface ImpersonationPanel {
  tokenEndpoint: string;
  grantType: string;
  subjectTokenType: string;
  requestedSubject: string;
  /** Client habilitado ao grant token-exchange usado no exemplo. */
  clientId: string;
  /** Comando curl pronto (subject_token como placeholder a preencher). */
  curl: string;
}

/**
 * Monta o painel de impersonation para o `targetId`. Retorna `null` quando NENHUM
 * client da config tem o grant token-exchange habilitado (sem ele o fluxo não
 * funciona) — a UI então mostra a instrução de habilitar o grant.
 */
export function buildImpersonationPanel(
  cfg: Pick<ResolvedServerConfig, 'issuer' | 'clients'>,
  targetId: string,
): ImpersonationPanel | null {
  const client = cfg.clients.find((c) => (c.grants ?? []).includes(TOKEN_EXCHANGE));
  if (!client) return null;

  const tokenEndpoint = `${cfg.issuer.replace(/\/+$/, '')}/token`;
  const auth = client.clientSecret
    ? `  -u '${client.clientId}:${client.clientSecret}' \\\n`
    : `  -d 'client_id=${client.clientId}' \\\n`;

  const curl = `curl -X POST '${tokenEndpoint}' \\\n${auth}  -d 'grant_type=${TOKEN_EXCHANGE}' \\\n  -d 'subject_token=<ADMIN_ACCESS_TOKEN>' \\\n  -d 'subject_token_type=${ACCESS_TOKEN_TYPE}' \\\n  -d 'requested_subject=${targetId}' \\\n  -d 'scope=openid profile email'`;

  return {
    tokenEndpoint,
    grantType: TOKEN_EXCHANGE,
    subjectTokenType: ACCESS_TOKEN_TYPE,
    requestedSubject: targetId,
    clientId: client.clientId,
    curl,
  };
}
