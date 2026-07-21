import { useAuthkitConfig } from '../config.js';
import { type ResourceState, useResource } from './use_resource.js';

export interface OrgEntry {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: string;
  isActive: boolean;
  [key: string]: unknown;
}

export interface UseOrganizationsResult extends ResourceState<OrgEntry[]> {
  /** ID da org ativa (null = personal account). */
  activeOrgId: string | null;
  /** true quando o feature está habilitado no servidor. */
  supported: boolean;
  actions: {
    refetch(): Promise<void>;
  };
}

interface OrgsResponse {
  supported: boolean;
  activeOrgId: string | null;
  orgs: OrgEntry[];
}

/**
 * Lista as organizações do usuário logado. Consome `GET /account/orgs/json` (ou
 * o endpoint configurado via `endpoints.orgs`). SSR-safe (só busca no cliente).
 */
export function useOrganizations(): UseOrganizationsResult {
  const config = useAuthkitConfig();
  const { data, loading, error, refetch } = useResource<OrgsResponse>(
    config.endpoints.orgs,
    config.csrfToken,
  );

  return {
    data: data?.orgs ?? null,
    loading,
    error,
    activeOrgId: data?.activeOrgId ?? null,
    supported: data?.supported ?? true,
    actions: { refetch },
  };
}
