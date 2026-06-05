import { useCallback } from 'react'
import { useAuthkitConfig, buildAuthUrl } from '../config.js'
import { currentUrl } from '../utils.js'

export interface SignInOptions {
  /** para onde voltar após o login; default = URL atual (SSR-safe) */
  returnTo?: string
}

/**
 * Hook headless de login. OIDC é redirect-based, então `signIn()` navega o
 * browser para a `loginUrl` configurada (acrescentando `returnTo`).
 */
export function useSignIn() {
  const config = useAuthkitConfig()
  const signIn = useCallback(
    (opts?: SignInOptions) => {
      const returnTo = opts?.returnTo ?? currentUrl()
      const url = buildAuthUrl(config.loginUrl, returnTo)
      if (typeof window !== 'undefined') window.location.assign(url)
    },
    [config.loginUrl]
  )
  return { signIn }
}
