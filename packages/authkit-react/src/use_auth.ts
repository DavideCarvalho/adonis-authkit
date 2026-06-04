import { useContext, useMemo } from 'react'
import { usePage } from '@inertiajs/react'
import { AuthContext } from './provider.js'
import {
  hasAllGlobalRoles as hasAllGlobalRolesPure,
  hasAnyGlobalRole as hasAnyGlobalRolePure,
  hasAppRole as hasAppRolePure,
  hasGlobalRole as hasGlobalRolePure,
} from './roles.js'
import type { AuthSharedProps, AuthState } from './types.js'

/** Estado não-autenticado (prop ausente ou usuário nulo). */
const UNAUTHENTICATED = {
  user: null,
  globalRoles: [] as string[],
  appRoles: undefined as string[] | undefined,
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
  const authkit = contextValue ?? pageProps?.authkit ?? UNAUTHENTICATED

  return useMemo<AuthState>(() => {
    const user = authkit.user ?? null
    const globalRoles = authkit.globalRoles ?? user?.globalRoles ?? []
    const appRoles = authkit.appRoles ?? user?.appRoles ?? []

    return {
      user,
      isAuthenticated: user !== null,
      globalRoles,
      appRoles,
      hasGlobalRole: (role: string) => hasGlobalRolePure(user, role),
      hasAnyGlobalRole: (roles: string[]) => hasAnyGlobalRolePure(user, roles),
      hasAllGlobalRoles: (roles: string[]) => hasAllGlobalRolesPure(user, roles),
      hasAppRole: (role: string) => hasAppRolePure(user, role),
    }
  }, [authkit])
}
