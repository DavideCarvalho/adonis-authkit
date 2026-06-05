/**
 * Prefixo do console admin — singleton de processo.
 *
 * Definido em tempo de registro das rotas (`registerAuthHost`) e lido em
 * runtime pelos controllers e pelo `adminGuard`. Garantia de normalização:
 * começa com '/', sem trailing slash, default '/admin'.
 *
 * Por que um módulo singleton e não um binding do container?
 * O container do AdonisJS só está disponível no ciclo de vida de uma request;
 * o prefixo precisa estar disponível ANTES da primeira request (ex.: na closure
 * do `adminGuard`, que é construída em tempo de registro) e DENTRO de cada
 * request. Um módulo ESM é inicializado uma vez por processo — perfeito para
 * configuração imutável definida no boot.
 */

const DEFAULT_ADMIN_PREFIX = '/admin'

let _prefix: string = DEFAULT_ADMIN_PREFIX

/**
 * Normaliza o prefixo: começa com '/', sem trailing slash.
 * `'/'` → `''` (raiz) é improvável mas seguro.
 */
export function normalizeAdminPrefix(raw: string): string {
  let p = raw.trim()
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/+$/, '')
  return p || '/'
}

/**
 * Define o prefixo do console admin para este processo.
 * Chamado UMA VEZ por `registerAuthHost` no boot da aplicação.
 *
 * @param prefix  Caminho base do console (ex.: `'/admin'`, `'/auth/admin'`).
 *                Normalizado automaticamente.
 */
export function setAdminPrefix(prefix: string): void {
  _prefix = normalizeAdminPrefix(prefix)
}

/**
 * Retorna o prefixo do console admin (default `'/admin'`).
 * Usado pelos controllers e pelo `adminGuard` para construir redirects/links.
 */
export function getAdminPrefix(): string {
  return _prefix
}
