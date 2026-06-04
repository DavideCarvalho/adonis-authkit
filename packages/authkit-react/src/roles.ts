import type { AuthUser } from './types.js'

/**
 * Lógica pura de verificação de papéis (sem React) — testável isoladamente.
 * `useAuth()` e os componentes de gating delegam para estas funções.
 */

/** Verdadeiro se o usuário possui o papel global informado. */
export function hasGlobalRole(user: AuthUser | null | undefined, role: string): boolean {
  if (!user) return false
  return user.globalRoles.includes(role)
}

/** Verdadeiro se o usuário possui ao menos um dos papéis globais informados. */
export function hasAnyGlobalRole(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user) return false
  return roles.some((role) => user.globalRoles.includes(role))
}

/** Verdadeiro se o usuário possui todos os papéis globais informados. */
export function hasAllGlobalRoles(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user) return false
  return roles.every((role) => user.globalRoles.includes(role))
}

/** Verdadeiro se o usuário possui o papel de app informado. */
export function hasAppRole(user: AuthUser | null | undefined, role: string): boolean {
  if (!user || !user.appRoles) return false
  return user.appRoles.includes(role)
}

/** Verdadeiro se o usuário possui ao menos um dos papéis de app informados. */
export function hasAnyAppRole(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user || !user.appRoles) return false
  const appRoles = user.appRoles
  return roles.some((role) => appRoles.includes(role))
}

/** Verdadeiro se o usuário possui todos os papéis de app informados. */
export function hasAllAppRoles(user: AuthUser | null | undefined, roles: string[]): boolean {
  if (!user || !user.appRoles) return false
  const appRoles = user.appRoles
  return roles.every((role) => appRoles.includes(role))
}
