import type { AuthUser } from './types.js'

/**
 * Lógica pura de verificação de papéis (sem React) — testável isoladamente.
 * `useAuth()` e os componentes de gating delegam para estas funções.
 */

/** Algoritmos genéricos por trás das variantes de papel global. */
function hasRole(arr: readonly string[], role: string): boolean {
  return arr.includes(role)
}

function hasAnyRole(arr: readonly string[], roles: string[]): boolean {
  return roles.some((role) => arr.includes(role))
}

function hasAllRoles(arr: readonly string[], roles: string[]): boolean {
  return roles.every((role) => arr.includes(role))
}

/** Verdadeiro se o usuário possui o papel global informado. */
export function hasGlobalRole(user: AuthUser | null | undefined, role: string): boolean {
  if (!user) return false
  return hasRole(user.globalRoles, role)
}

/** Verdadeiro se o usuário possui ao menos um dos papéis globais informados. */
export function hasAnyGlobalRole(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user) return false
  return hasAnyRole(user.globalRoles, roles)
}

/** Verdadeiro se o usuário possui todos os papéis globais informados. */
export function hasAllGlobalRoles(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user) return false
  return hasAllRoles(user.globalRoles, roles)
}
