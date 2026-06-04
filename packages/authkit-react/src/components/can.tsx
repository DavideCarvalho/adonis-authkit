import { createElement, Fragment, type ReactNode } from 'react'
import { useAuth } from '../use_auth.js'
import {
  hasAllAppRoles,
  hasAllGlobalRoles,
  hasAnyAppRole,
  hasAnyGlobalRole,
  hasAppRole,
  hasGlobalRole,
} from '../roles.js'

export interface CanProps {
  children: ReactNode
  /** papel único a verificar */
  role?: string
  /** lista de papéis a verificar (combinada via `mode`) */
  roles?: string[]
  /** semântica para `roles`: ao menos um (`any`, default) ou todos (`all`) */
  mode?: 'any' | 'all'
  /** verifica papéis de app em vez de papéis globais */
  appRole?: boolean
  /** renderizado quando o usuário não tem o(s) papel(éis) */
  fallback?: ReactNode
}

/**
 * Renderiza `children` somente se o usuário possuir o(s) papel(éis) exigido(s),
 * caso contrário renderiza `fallback`.
 *
 * - `<Can role="ADMIN">` — papel global único
 * - `<Can roles={['A','B']} mode="all">` — exige todos
 * - `<Can role="EDITOR" appRole>` — verifica papel de app
 */
export function Can({
  children,
  role,
  roles,
  mode = 'any',
  appRole = false,
  fallback = null,
}: CanProps) {
  const { user } = useAuth()

  let allowed = false
  if (role !== undefined) {
    allowed = appRole ? hasAppRole(user, role) : hasGlobalRole(user, role)
  } else if (roles !== undefined) {
    if (appRole) {
      allowed = mode === 'all' ? hasAllAppRoles(user, roles) : hasAnyAppRole(user, roles)
    } else {
      allowed = mode === 'all' ? hasAllGlobalRoles(user, roles) : hasAnyGlobalRole(user, roles)
    }
  }

  return createElement(Fragment, null, allowed ? children : fallback)
}
