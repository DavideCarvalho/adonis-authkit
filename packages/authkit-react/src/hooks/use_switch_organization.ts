import { useCallback, useState } from 'react'
import { useAuthkitConfig } from '../config.js'
import { jsonRequest } from './use_resource.js'

export interface UseSwitchOrganizationResult {
  loading: boolean
  error: Error | null
  /** Ativa uma org pelo id (POST /account/orgs/:id/activate). */
  activate(orgId: string): Promise<void>
  /** Desativa a org ativa (POST /account/orgs/deactivate). */
  deactivate(): Promise<void>
}

/**
 * Hook headless para trocar a org ativa. Após a troca, o servidor atualiza o
 * cookie `authkit_active_org`. O consumidor deve refazer `useOrganizations()`
 * para refletir o novo estado.
 */
export function useSwitchOrganization(): UseSwitchOrganizationResult {
  const config = useAuthkitConfig()
  const base = config.endpoints.orgs.replace('/json', '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const activate = useCallback(
    async (orgId: string) => {
      setLoading(true)
      setError(null)
      try {
        await jsonRequest(`${base}/${encodeURIComponent(orgId)}/activate`, {
          method: 'POST',
          csrfToken: config.csrfToken,
        })
      } catch (err) {
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    },
    [base, config.csrfToken]
  )

  const deactivate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await jsonRequest(`${base}/deactivate`, {
        method: 'POST',
        csrfToken: config.csrfToken,
      })
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [base, config.csrfToken])

  return { loading, error, activate, deactivate }
}
