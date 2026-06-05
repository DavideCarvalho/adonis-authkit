import { AuthkitApiError } from './errors.js'
import type {
  Authkit,
  AuthkitClient,
  AuthkitCreatedClient,
  AuthkitCreatedUser,
  AuthkitStats,
  AuthkitUser,
  ClientInput,
  CreateUserInput,
  DeletedClient,
  DeletedUser,
  ListAuditParams,
  ListAuditResult,
  ListClientsResult,
  ListSessionsResult,
  ListUsersParams,
  ListUsersResult,
  RegeneratedSecret,
  ResetPasswordResult,
  RevokeSessionsResult,
  UpdateUserInput,
  UserStatusResult,
  VerifyTokenResult,
} from './types.js'

export interface RemoteOptions {
  /** Base URL of the IdP host, e.g. `https://idp.example.com`. */
  baseUrl: string
  /** Admin API key sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string
  /** Override the fetch implementation (defaults to global `fetch`). */
  fetchImpl?: typeof fetch
}

type FetchLike = typeof fetch

/** Drops `undefined` query params and stringifies the rest. */
function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Remote driver: a thin typed fetch wrapper over the Admin REST API
 * (`/api/authkit/v1/*`). Paths match the server route list EXACTLY. Non-2xx
 * responses are mapped to {@link AuthkitApiError} (parsed from the
 * `{ error: { code, message } }` envelope); network/parse failures are wrapped
 * in an error with code `network_error`.
 */
export function createRemoteAuthkit(opts: RemoteOptions): Authkit {
  const baseUrl = opts.baseUrl.replace(/\/+$/, '')
  const root = `${baseUrl}/api/authkit/v1`
  const doFetch: FetchLike = opts.fetchImpl ?? (globalThis.fetch as FetchLike)

  if (typeof doFetch !== 'function') {
    throw new Error('No fetch implementation available — pass `fetchImpl` to createAuthkit.')
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.apiKey}`,
      accept: 'application/json',
    }
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    let res: Response
    try {
      res = await doFetch(`${root}${path}`, init)
    } catch (err) {
      throw new AuthkitApiError(0, 'network_error', (err as Error).message || 'Network request failed.')
    }

    const text = await res.text()
    const payload = text ? safeJson(text) : undefined

    if (!res.ok) {
      const envelope = (payload as { error?: { code?: string; message?: string } } | undefined)?.error
      throw new AuthkitApiError(
        res.status,
        envelope?.code ?? 'http_error',
        envelope?.message ?? `Request failed with status ${res.status}.`
      )
    }

    return payload as T
  }

  function safeJson(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  return {
    users: {
      list(params: ListUsersParams = {}) {
        return request<ListUsersResult>('GET', `/users${buildQuery({ ...params })}`)
      },
      get(id: string) {
        return request<AuthkitUser>('GET', `/users/${encodeURIComponent(id)}`)
      },
      create(input: CreateUserInput) {
        return request<AuthkitCreatedUser>('POST', '/users', input)
      },
      update(id: string, input: UpdateUserInput) {
        return request<AuthkitUser>('PATCH', `/users/${encodeURIComponent(id)}`, input)
      },
      disable(id: string) {
        return request<UserStatusResult>('POST', `/users/${encodeURIComponent(id)}/disable`)
      },
      enable(id: string) {
        return request<UserStatusResult>('POST', `/users/${encodeURIComponent(id)}/enable`)
      },
      resetPassword(id: string) {
        return request<ResetPasswordResult>('POST', `/users/${encodeURIComponent(id)}/reset-password`)
      },
      delete(id: string) {
        return request<DeletedUser>('DELETE', `/users/${encodeURIComponent(id)}`)
      },
    },
    sessions: {
      list(userId: string) {
        return request<ListSessionsResult>('GET', `/users/${encodeURIComponent(userId)}/sessions`)
      },
      revokeAll(userId: string) {
        return request<RevokeSessionsResult>('POST', `/users/${encodeURIComponent(userId)}/revoke-sessions`)
      },
    },
    clients: {
      list() {
        return request<ListClientsResult>('GET', '/clients')
      },
      get(id: string) {
        return request<AuthkitClient>('GET', `/clients/${encodeURIComponent(id)}`)
      },
      create(input: ClientInput) {
        return request<AuthkitCreatedClient>('POST', '/clients', input)
      },
      update(id: string, input: ClientInput) {
        return request<AuthkitClient>('PATCH', `/clients/${encodeURIComponent(id)}`, input)
      },
      regenerateSecret(id: string) {
        return request<RegeneratedSecret>('POST', `/clients/${encodeURIComponent(id)}/regenerate-secret`)
      },
      delete(id: string) {
        return request<DeletedClient>('DELETE', `/clients/${encodeURIComponent(id)}`)
      },
    },
    audit: {
      list(params: ListAuditParams = {}) {
        return request<ListAuditResult>('GET', `/audit${buildQuery({ ...params })}`)
      },
    },
    stats() {
      return request<AuthkitStats>('GET', '/stats')
    },
    tokens: {
      verify(token: string) {
        return request<VerifyTokenResult>('POST', '/tokens/verify', { token })
      },
    },
  }
}
