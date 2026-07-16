import { useContext, useMemo } from 'react'
import { usePage } from '@inertiajs/react'
import { AuthContext } from './provider.js'
import {
  hasAllGlobalRoles as hasAllGlobalRolesPure,
  hasAnyGlobalRole as hasAnyGlobalRolePure,
  hasGlobalRole as hasGlobalRolePure,
} from './roles.js'
import type { AuthSharedProps, AuthState } from './types.js'

/** Estado não-autenticado (prop ausente ou usuário nulo). */
const UNAUTHENTICATED = {
  user: null,
  globalRoles: [] as string[],
} satisfies AuthSharedProps['authkit']

/**
 * Hook tipado para consumir o estado de autenticação do AuthKit no frontend.
 *
 * Por padrão lê a shared-prop `authkit` de `usePage().props`. Se um
 * `<AuthProvider>` estiver presente acima na árvore, o valor do contexto
 * tem precedência (útil fora do Inertia).
 *
 * Nunca lança quando a prop está ausente: retorna estado não-autenticado.
 */
export function useAuth(): AuthState {
  const contextValue = useContext(AuthContext)
  // `usePage` é seguro de chamar sempre (hooks não podem ser condicionais).
  const pageProps = usePage<AuthSharedProps>().props
  const resolved = contextValue ?? pageProps?.authkit
  if (!resolved && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[authkit] useAuth(): no <AuthProvider> nor shared-prop `authkit` found — returning unauthenticated state.'
    )
  }
  const authkit = resolved ?? UNAUTHENTICATED

  return useMemo<AuthState>(() => {
    const user = authkit.user ?? null
    const globalRoles = authkit.globalRoles ?? user?.globalRoles ?? []

    return {
      user,
      isAuthenticated: user !== null,
      globalRoles,
      hasGlobalRole: (role: string) => hasGlobalRolePure(user, role),
      hasAnyGlobalRole: (roles: string[]) => hasAnyGlobalRolePure(user, roles),
      hasAllGlobalRoles: (roles: string[]) => hasAllGlobalRolesPure(user, roles),
    }
  }, [authkit])
}
