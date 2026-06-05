import { useAuth } from '../use_auth.js'
import type { AuthUser } from '../types.js'

export interface UseUserResult {
  user: AuthUser | null
  isAuthenticated: boolean
}

/**
 * Alias ergonômico sobre `useAuth()` que expõe diretamente o usuário.
 * `user` é `null` quando não autenticado.
 */
export function useUser(): UseUserResult {
  const { user, isAuthenticated } = useAuth()
  return { user, isAuthenticated }
}
