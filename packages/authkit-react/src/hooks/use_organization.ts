import { useAuthkitConfig } from '../config.js'
import { useResource, type ResourceState } from './use_resource.js'

export interface OrgMemberEntry {
  accountId: string
  email: string | null
  role: string
  joinedAt: string
}

export interface ActiveOrgDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  role: string
  canManage: boolean
  members: OrgMemberEntry[]
  [key: string]: unknown
}

export interface UseOrganizationResult extends ResourceState<ActiveOrgDetail> {
  actions: {
    refetch(): Promise<void>
  }
}

/**
 * Retorna os detalhes da organização ativa (membros incluídos se o papel permite).
 * Consome `GET /account/orgs/:id/json`. Passa `orgId` null para não buscar nada.
 */
export function useOrganization(orgId: string | null): UseOrganizationResult {
  const config = useAuthkitConfig()
  const url = orgId ? `${config.endpoints.orgs.replace('/json', '')}/${encodeURIComponent(orgId)}/json` : ''
  const { data, loading, error, refetch } = useResource<ActiveOrgDetail>(
    url,
    config.csrfToken
  )

  return { data, loading: url ? loading : false, error, actions: { refetch } }
}
