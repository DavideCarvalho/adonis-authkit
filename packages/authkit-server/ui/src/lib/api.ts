import { getConfig } from './config'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  queryParams?: Record<string, string | number | undefined>
): Promise<T> {
  const cfg = getConfig()
  const base = cfg.endpoints.api

  let url = `${base}${path}`
  if (queryParams) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== '') q.set(k, String(v))
    }
    const qs = q.toString()
    if (qs) url += `?${qs}`
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (cfg.csrfToken && method !== 'GET') {
    headers['x-csrf-token'] = cfg.csrfToken
  }

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    // Redirect to login
    window.location.href = '/account/login?return_to=' + encodeURIComponent(window.location.href)
    throw new ApiError(401, 'unauthorized', 'Not authenticated')
  }

  if (!res.ok) {
    let errBody: { error?: string; message?: string } = {}
    try {
      errBody = await res.json()
    } catch {
      // ignore
    }
    throw new ApiError(
      res.status,
      errBody.error ?? 'error',
      errBody.message ?? `HTTP ${res.status}`,
      errBody
    )
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }

  return res.json() as Promise<T>
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface OverviewData {
  usersTotal: number
  activeSessions: number
  mau: number
  signInsTotal: number
  signUpsTotal: number
  signInsPerDay: Array<{ date: string; count: number }>
  signUpsPerDay: Array<{ date: string; count: number }>
  windowDays: number
  clientsCount: number
  auditTotal: number
  auditSupported: boolean
  recentEvents: AuditEvent[]
}

export const api = {
  overview: {
    get: () => request<OverviewData>('GET', '/overview'),
  },

  // ─── Users ────────────────────────────────────────────────────────────────

  users: {
    list: (params?: { search?: string; page?: number; perPage?: number }) =>
      request<{ data: User[]; total: number; page: number; perPage: number }>(
        'GET',
        '/users',
        undefined,
        params
      ),
    get: (id: string) => request<UserDetail>('GET', `/users/${id}`),
    create: (data: { email: string; name?: string; password?: string; invite?: boolean }) =>
      request<User & { invited: boolean }>('POST', '/users', data),
    updateRoles: (id: string, roles: string[]) =>
      request<User>('PATCH', `/users/${id}/roles`, { roles }),
    disable: (id: string) => request<User>('POST', `/users/${id}/disable`),
    enable: (id: string) => request<User>('POST', `/users/${id}/enable`),
    resetPassword: (id: string) =>
      request<{ ok: boolean; email: string }>('POST', `/users/${id}/reset-password`),
    delete: (id: string) => request<{ ok: boolean; deleted: string }>('DELETE', `/users/${id}`),
  },

  // ─── Sessions ─────────────────────────────────────────────────────────────

  sessions: {
    list: (params?: { page?: number; perPage?: number }) =>
      request<{ data: Session[]; total: number; page: number; perPage: number }>(
        'GET',
        '/sessions',
        undefined,
        params
      ),
    revokeAll: () => request<{ revoked: number }>('POST', '/sessions/revoke-all'),
  },

  // ─── Clients ──────────────────────────────────────────────────────────────

  clients: {
    list: () => request<{ data: Client[]; canList: boolean }>('GET', '/clients'),
    create: (data: ClientInput) =>
      request<{ clientId: string; clientSecret: string | null }>('POST', '/clients', data),
    update: (id: string, data: ClientInput) => request<Client>('PATCH', `/clients/${id}`, data),
    delete: (id: string) => request<{ ok: boolean }>('DELETE', `/clients/${id}`),
    regenerateSecret: (id: string) =>
      request<{ clientId: string; clientSecret: string | null }>(
        'POST',
        `/clients/${id}/regenerate-secret`
      ),
  },

  // ─── Roles ────────────────────────────────────────────────────────────────

  roles: {
    list: () => request<{ data: Role[] }>('GET', '/roles'),
    create: (data: { name: string; description?: string }) =>
      request<Role>('POST', '/roles', data),
    update: (name: string, data: { description?: string }) =>
      request<Role>('PATCH', `/roles/${name}`, data),
    delete: (name: string) => request<{ ok: boolean }>('DELETE', `/roles/${name}`),
  },

  // ─── Orgs ─────────────────────────────────────────────────────────────────

  orgs: {
    list: (params?: { search?: string; page?: number; perPage?: number }) =>
      request<{ data: Org[]; total: number; page: number; perPage: number }>(
        'GET',
        '/orgs',
        undefined,
        params
      ),
    get: (id: string) => request<OrgDetail>('GET', `/orgs/${id}`),
  },

  // ─── Audit ────────────────────────────────────────────────────────────────

  audit: {
    list: (params?: { type?: string; page?: number; perPage?: number }) =>
      request<{ data: AuditEvent[]; total: number; page: number; perPage: number }>(
        'GET',
        '/audit',
        undefined,
        params
      ),
  },

  // ─── Settings ─────────────────────────────────────────────────────────────

  settings: {
    list: () => request<{ data: Setting[] }>('GET', '/settings'),
    upsert: (key: string, value: unknown) =>
      request<Setting>('PUT', `/settings/${key}`, { value }),
    delete: (key: string) => request<{ key: string; deleted: boolean }>('DELETE', `/settings/${key}`),
  },

  // ─── Impersonation ────────────────────────────────────────────────────────

  impersonation: {
    get: (userId: string) =>
      request<{ url: string; token: string }>('GET', `/impersonation/${userId}`),
  },
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  globalRoles: string[]
  disabled: boolean
}

export interface UserDetail extends User {
  sessionsSupported: boolean
  sessions: Session[]
  grants: Grant[]
  statusSupported: boolean
  deletionSupported: boolean
  catalogRoles: Array<{ name: string; description?: string }>
}

export interface Session {
  id: string
  accountId: string
  loginTs: string | null
  amr: string[]
  userAgent: string | null
  browser: string | null
  os: string | null
  ip: string | null
  location: string | null
}

export interface Grant {
  id: string
  accountId: string
  clientId: string | null
  accessTokens: number
  refreshTokens: number
}

export interface Client {
  clientId: string
  confidential: boolean
  grants: string[]
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  tokenEndpointAuthMethod: string
  backchannelLogoutUri: string | null
  backchannelLogoutSessionRequired: boolean
}

export interface ClientInput {
  clientId?: string
  redirectUris: string[]
  postLogoutRedirectUris?: string[]
  grantTypes?: string[]
  tokenEndpointAuthMethod?: string
  backchannelLogoutUri?: string
  backchannelLogoutSessionRequired?: boolean
}

export interface Role {
  name: string
  description?: string
  builtin?: boolean
}

export interface Org {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  metadata: unknown
  createdAt: string
  memberCount?: number
}

export interface OrgDetail extends Org {
  members: Array<{ accountId: string; email: string | null; role: string; joinedAt: string }>
  invitations: Array<{ email: string; role: string; token: string; expiresAt: string }>
}

export interface AuditEvent {
  id: string
  type: string
  accountId: string | null
  email: string | null
  clientId: string | null
  actorId: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface Setting {
  key: string
  value: unknown
  updatedAt: string | null
  updatedBy: string | null
  isDefault?: boolean
}
