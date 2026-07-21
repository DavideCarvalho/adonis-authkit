/**
 * URL de login do console de conta — singleton de processo.
 *
 * Definida em tempo de registro das rotas (`registerAuthHost`, via a opção
 * `accountLoginUrl`) e lida em runtime por TODOS os pontos que redirecionam o
 * visitante não-autenticado para "faça login": os guards (`accountGuard`/
 * `adminGuard`), o middleware `AccountAuthMiddleware`, o helper público
 * `consoleLoginUrl()`, os redirects de fallback dos controllers de conta e a
 * view Edge `otp-unlock` (injetada como prop `loginUrl` pelo renderer).
 *
 * Existe porque a tela `account/login` é DESMONTÁVEL (`account: { login: false }`):
 * um host OIDC passwordless não monta o login por senha da lib e aponta o
 * redirect de não-autenticado para a própria rota de login dele (ex.: `/login`).
 * Sem esta indireção, esses destinos ficariam presos no `/account/login` que
 * deixou de existir.
 *
 * Default `/account/login` (back-compat total: hosts que não passam a opção
 * seguem redirecionando para a tela montada de sempre).
 *
 * Por que módulo singleton e não binding do container? Mesma razão do
 * `admin_prefix`: os guards são closures construídas em tempo de registro,
 * ANTES da primeira request, quando o container ainda não existe. Um módulo ESM
 * é inicializado uma vez por processo — ideal para configuração imutável de boot.
 */

const DEFAULT_ACCOUNT_LOGIN_URL = '/account/login'

let _loginUrl: string = DEFAULT_ACCOUNT_LOGIN_URL

/**
 * Define a URL de login do console de conta para este processo.
 * Chamado UMA VEZ por `registerAuthHost` no boot da aplicação.
 *
 * Não normaliza o path: aceita qualquer caminho interno que o host queira
 * (ex.: `'/login'`, `'/auth/entrar'`). Valor vazio/whitespace cai no default.
 *
 * @param url  Caminho de destino do redirect de não-autenticado.
 */
export function setAccountLoginUrl(url: string): void {
  const trimmed = (url ?? '').trim()
  _loginUrl = trimmed || DEFAULT_ACCOUNT_LOGIN_URL
}

/**
 * Retorna a URL de login do console de conta (default `'/account/login'`).
 * Usada por todo redirect/link de "faça login" da lib.
 */
export function getAccountLoginUrl(): string {
  return _loginUrl
}

/** Restaura o default — uso em testes (isola o singleton entre casos). */
export function resetAccountLoginUrl(): void {
  _loginUrl = DEFAULT_ACCOUNT_LOGIN_URL
}
