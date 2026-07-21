/**
 * Prefixo e segmentos de tela do console de conta (`/account/*`) — singleton de
 * processo, configurável/localizável.
 *
 * Definidos em tempo de registro das rotas (`registerAuthHost`, via a opção
 * `accountRoutes`) e lidos em runtime por TODOS os pontos que constroem uma URL
 * do console de conta: o registro de rotas, os redirects dos controllers, as
 * URLs absolutas dos e-mails transacionais, os guards de sudo e as views Edge
 * (injetados como prop global `accountPaths` pelo renderer).
 *
 * Por que módulo singleton e não binding do container? Mesma razão do
 * `admin_prefix` e do `account_login_url`: os guards e o registro de rotas são
 * closures construídas em tempo de registro, ANTES da primeira request, quando
 * o container do AdonisJS ainda não existe. Um módulo ESM é inicializado uma vez
 * por processo — ideal para configuração imutável de boot.
 *
 * ── O que é configurável e o que NÃO é ──────────────────────────────────────
 * Configuráveis: o PREFIXO (`/account` → `/conta`) e o SEGMENTO de cada TELA
 * navegável (`security` → `seguranca`, `confirm` → `confirmar`, ...). São paths
 * que o usuário vê na barra de endereço e que um host pode querer no idioma dele.
 *
 * NÃO configuráveis (de propósito): os action-subpaths dos POSTs de dentro de
 * cada tela — `/password`, `/email`, `/enroll`, `/confirm`, `/disable`,
 * `/passkeys/options`, `/passkeys/verify`, `/delete`, `/export`, o `/magic-link`
 * e o `/passkey` das rotas de sudo, etc. São endpoints de formulário invisíveis
 * ao usuário (ele nunca digita `/account/security/password`), servem apenas de
 * alvo de `<form action>`/`fetch`, e mantê-los fixos evita multiplicar a
 * superfície de configuração (e a de bugs) sem nenhum ganho de UX. Renomear a
 * tela já cobre o caso real "quero /conta/seguranca". Idem para o segmento fixo
 * `api` da JSON API (`{prefix}/api/*`): ele segue o prefixo mas nunca é
 * traduzido — é contrato de máquina (authkit-react), não de humano.
 */

/** Prefixo default do console de conta. */
const DEFAULT_ACCOUNT_PREFIX = '/account';

/**
 * Segmentos default de cada TELA navegável do console de conta. A chave é o
 * identificador estável usado no código (`accountPath('security')`); o valor é
 * o segmento de URL, sobrescrevível por `setAccountPaths`.
 */
const DEFAULT_ACCOUNT_SEGMENTS = {
  login: 'login',
  logout: 'logout',
  security: 'security',
  mfa: 'mfa',
  confirm: 'confirm',
  tokens: 'tokens',
  apps: 'apps',
  orgs: 'orgs',
  emailConfirm: 'email/confirm',
} as const;

/** Chave de tela do console de conta (`login`, `security`, `confirm`, ...). */
export type AccountPathKey = keyof typeof DEFAULT_ACCOUNT_SEGMENTS;

/** Overrides aceitos por `setAccountPaths` / a opção `accountRoutes`. */
export interface AccountPathsOptions {
  /** Prefixo base do console (ex.: `'/conta'`). Normalizado automaticamente. */
  prefix?: string;
  /** Segmentos de tela a sobrescrever (ex.: `{ security: 'seguranca' }`). */
  paths?: Partial<Record<AccountPathKey, string>>;
}

let _prefix: string = DEFAULT_ACCOUNT_PREFIX;
let _segments: Record<AccountPathKey, string> = { ...DEFAULT_ACCOUNT_SEGMENTS };

/**
 * Normaliza o prefixo: começa com '/', sem trailing slash. Mesma semântica de
 * `normalizeAdminPrefix`. `'/'` → `'/'` (raiz) é improvável mas seguro.
 */
export function normalizeAccountPrefix(raw: string): string {
  let p = raw.trim();
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/+$/, '');
  return p || '/';
}

/**
 * Normaliza um segmento de tela: sem barras nas pontas (mas preserva barras
 * internas, ex.: `'email/confirm'`). Valor vazio é ignorado pelo caller.
 */
function normalizeSegment(raw: string): string {
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Define o prefixo e/ou os segmentos de tela do console de conta para este
 * processo. Chamado UMA VEZ por `registerAuthHost` no boot da aplicação.
 *
 * Só sobrescreve o que foi passado — chamada sem `prefix` mantém o prefixo
 * atual, e segmentos ausentes de `paths` mantêm o default. Valores
 * vazios/whitespace são ignorados (caem no default), nunca produzem um path
 * quebrado.
 *
 * @example
 * setAccountPaths({ prefix: '/conta', paths: { security: 'seguranca', confirm: 'confirmar' } })
 * accountPath('security') // → '/conta/seguranca'
 * accountPath('confirm')  // → '/conta/confirmar'
 */
export function setAccountPaths(opts: AccountPathsOptions | undefined): void {
  if (!opts) return;
  if (opts.prefix !== undefined) {
    const trimmed = opts.prefix.trim();
    if (trimmed) _prefix = normalizeAccountPrefix(trimmed);
  }
  if (opts.paths) {
    for (const key of Object.keys(opts.paths) as AccountPathKey[]) {
      const value = opts.paths[key];
      if (value === undefined) continue;
      const seg = normalizeSegment(value);
      if (seg) _segments[key] = seg;
    }
  }
}

/**
 * Retorna o path completo de uma TELA do console de conta (prefixo + segmento).
 * Para os action-subpaths (POSTs de dentro da tela) concatene o subpath fixo:
 * `accountPath('security') + '/password'`.
 *
 * @example
 * accountPath('security') // default → '/account/security'
 * accountPath('confirm')  // default → '/account/confirm'
 */
export function accountPath(key: AccountPathKey): string {
  return `${_prefix}/${_segments[key]}`;
}

/**
 * Retorna o prefixo do console de conta (default `'/account'`). Usado para a
 * JSON API (`{prefix}/api/*`), cujo segmento `api` é fixo (contrato de máquina).
 */
export function accountPrefix(): string {
  return _prefix;
}

/**
 * Mapa `{ chave → path completo }` de TODAS as telas. Injetado como prop global
 * `accountPaths` nas views Edge, para que os `<form action>`/`fetch()` respeitem
 * os overrides sem cada view conhecer o prefixo.
 */
export function accountPathsMap(): Record<AccountPathKey, string> {
  const out = {} as Record<AccountPathKey, string>;
  for (const key of Object.keys(_segments) as AccountPathKey[]) {
    out[key] = accountPath(key);
  }
  return out;
}

/** Restaura os defaults — uso em testes (isola o singleton entre casos). */
export function resetAccountPaths(): void {
  _prefix = DEFAULT_ACCOUNT_PREFIX;
  _segments = { ...DEFAULT_ACCOUNT_SEGMENTS };
}
