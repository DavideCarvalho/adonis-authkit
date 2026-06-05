/**
 * SDK-owned types. We DELIBERATELY duplicate the DTO shapes returned by the
 * Admin REST API (`packages/authkit-server/.../admin_api/dto.ts`) rather than
 * importing them from `@dudousxd/adonis-authkit-server`, so that remote-only
 * consumers can install JUST this package with ZERO dependency on the server
 * kit. The embedded driver maps the server's runtime values into these exact
 * shapes — keep them in sync with the server DTOs.
 */

/** A user/account as projected by the Admin API (`userDto`). */
export interface AuthkitUser {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  globalRoles: string[]
  disabled: boolean
}

/** Result of `users.create` — the user plus whether an invite e-mail was sent. */
export interface AuthkitCreatedUser extends AuthkitUser {
  invited: boolean
}

export interface ListUsersParams {
  search?: string
  page?: number
  limit?: number
}

export interface ListUsersResult {
  data: AuthkitUser[]
  total: number
  page: number
  limit: number
}

export interface CreateUserInput {
  email: string
  name?: string | null
  password?: string | null
  /** When true (and no password), creates with a random password and sends an invite/reset e-mail. */
  invite?: boolean
}

export interface UpdateUserInput {
  globalRoles?: string[]
  name?: string | null
  avatarUrl?: string | null
}

/** An active IdP session (`sessionDto`). */
export interface AuthkitSession {
  id: string
  accountId: string
  loginTs: number | null
  amr: string[]
}

/** A grant with live token counts (`grantDto`). */
export interface AuthkitGrant {
  id: string
  accountId: string
  clientId: string | null
  accessTokens: number
  refreshTokens: number
}

export interface ListSessionsResult {
  canList: boolean
  sessions: AuthkitSession[]
  grants: AuthkitGrant[]
}

/** Counts returned by a bulk session/grant revocation. */
export interface RevokeSessionsResult {
  sessions: number
  grants: number
  accessTokens: number
  refreshTokens: number
}

/** An OIDC client as projected by the Admin API (`clientDto`). */
export interface AuthkitClient {
  clientId: string
  confidential: boolean
  grants: string[]
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  tokenEndpointAuthMethod: string
}

export interface ListClientsResult {
  data: AuthkitClient[]
  canList: boolean
}

export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none'

export interface ClientInput {
  clientId?: string
  redirectUris?: string[]
  postLogoutRedirectUris?: string[]
  grantTypes?: string[]
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod
}

/** Created/regenerated client — the secret is shown ONCE (`createdClientDto`). */
export interface AuthkitCreatedClient {
  clientId: string
  clientSecret: string | null
}

export interface RegeneratedSecret {
  clientId: string
  clientSecret: string
}

export interface DeletedClient {
  clientId: string
  deleted: boolean
}

/** An audit event (`auditDto`). */
export interface AuthkitAuditEvent {
  id: string | number
  type: string
  accountId: string | null
  email: string | null
  clientId: string | null
  actorId: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface ListAuditParams {
  type?: string
  subject?: string
  page?: number
  limit?: number
}

export interface ListAuditResult {
  data: AuthkitAuditEvent[]
  total: number
  page: number
  limit: number
}

/** Generic token introspection result (`VerifyResult`). */
export type VerifyTokenResult =
  | { active: false }
  | {
      active: true
      tokenType: 'pat' | 'access_token'
      sub: string
      email?: string | null
      name?: string | null
      roles?: string[]
      scopes?: string[]
      audience?: string | string[] | null
      clientId?: string | null
      exp?: number | null
    }

/** Result of `users.disable`/`users.enable`. */
export interface UserStatusResult {
  id: string
  disabled: boolean
}

/** Result of `users.resetPassword`. */
export interface ResetPasswordResult {
  id: string
  sent: boolean
}

/**
 * Result of `users.delete` — the cascade counts of what was removed (sessions,
 * grants, tokens, PATs, passkeys, linked identities) plus how many audit rows were
 * anonymized (kept, not deleted) and whether the avatar was removed.
 */
export interface DeletedUser {
  id: string
  deleted: boolean
  sessions: number
  grants: number
  accessTokens: number
  refreshTokens: number
  pats: number
  passkeys: number
  providerIdentities: number
  auditAnonymized: number
  avatarDeleted: boolean
}

/** The shared SDK interface, implemented identically by both drivers. */
export interface Authkit {
  users: {
    list(params?: ListUsersParams): Promise<ListUsersResult>
    get(id: string): Promise<AuthkitUser>
    create(input: CreateUserInput): Promise<AuthkitCreatedUser>
    update(id: string, input: UpdateUserInput): Promise<AuthkitUser>
    disable(id: string): Promise<UserStatusResult>
    enable(id: string): Promise<UserStatusResult>
    resetPassword(id: string): Promise<ResetPasswordResult>
    /** Permanently deletes a user and cascades all associated data (LGPD/GDPR). */
    delete(id: string): Promise<DeletedUser>
  }
  sessions: {
    list(userId: string): Promise<ListSessionsResult>
    revokeAll(userId: string): Promise<RevokeSessionsResult>
  }
  clients: {
    list(): Promise<ListClientsResult>
    get(id: string): Promise<AuthkitClient>
    create(input: ClientInput): Promise<AuthkitCreatedClient>
    update(id: string, input: ClientInput): Promise<AuthkitClient>
    regenerateSecret(id: string): Promise<RegeneratedSecret>
    delete(id: string): Promise<DeletedClient>
  }
  audit: {
    list(params?: ListAuditParams): Promise<ListAuditResult>
  }
  tokens: {
    verify(token: string): Promise<VerifyTokenResult>
  }
}
