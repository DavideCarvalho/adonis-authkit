import { useCallback } from 'react'
import { useAuthkitConfig, buildAuthUrl } from '../config.js'

export interface SignOutOptions {
  /** para onde ir após o logout */
  returnTo?: string
}

/**
 * Hook headless de logout. Navega o browser para a `logoutUrl` configurada
 * (acrescentando `returnTo` se houver).
 */
export function useSignOut() {
  const config = useAuthkitConfig()
  const signOut = useCallback(
    (opts?: SignOutOptions) => {
      const url = buildAuthUrl(config.logoutUrl, opts?.returnTo)
      if (typeof window !== 'undefined') window.location.assign(url)
    },
    [config.logoutUrl]
  )
  return { signOut }
}
