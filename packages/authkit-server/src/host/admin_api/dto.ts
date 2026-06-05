import type { AuthAccount } from '../../accounts/account_store.js'
import type { OrgSummary, OrgMember, OrgInvitation } from '../../accounts/account_store.js'
import type { OrgDetail } from './admin_orgs_service.js'
import type { AdminClient, CreatedClient } from '../admin_clients_service.js'
import type { AdminSession, AdminGrant } from '../admin_sessions_service.js'
import type { StoredAuditEvent } from '../../audit/audit_sink.js'

/** Projeta uma conta para a forma JSON (camelCase) da Admin REST API. */
export function userDto(account: AuthAccount, disabled = false) {
  return {
    id: account.id,
    email: account.email,
    name: account.name ?? null,
    avatarUrl: account.avatarUrl ?? null,
    globalRoles: account.globalRoles ?? [],
    disabled,
  }
}

export function clientDto(client: AdminClient) {
  return {
    clientId: client.clientId,
    confidential: client.confidential,
    grants: client.grants,
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: client.postLogoutRedirectUris,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
  }
}

/** Inclui o secret (mostrado UMA vez) em create/regenerate. */
export function createdClientDto(created: CreatedClient) {
  return {
    clientId: created.clientId,
    clientSecret: created.clientSecret ?? null,
  }
}

export function sessionDto(session: AdminSession) {
  return {
    id: session.id,
    accountId: session.accountId,
    loginTs: session.loginTs ?? null,
    amr: session.amr ?? [],
    userAgent: session.userAgent ?? null,
    browser: session.browser ?? null,
    os: session.os ?? null,
    ip: session.ip ?? null,
    location: session.location ?? null,
  }
}

export function grantDto(grant: AdminGrant) {
  return {
    id: grant.id,
    accountId: grant.accountId,
    clientId: grant.clientId ?? null,
    accessTokens: grant.accessTokens,
    refreshTokens: grant.refreshTokens,
  }
}

export function auditDto(event: StoredAuditEvent) {
  return {
    id: event.id,
    type: event.type,
    accountId: event.accountId ?? null,
    email: event.email ?? null,
    clientId: event.clientId ?? null,
    actorId: event.actorId ?? null,
    ip: event.ip ?? null,
    metadata: event.metadata ?? null,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
  }
}

export function orgDto(org: OrgSummary & { memberCount?: number }) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl ?? null,
    metadata: org.metadata ?? null,
    createdAt: org.createdAt,
    ...(org.memberCount !== undefined ? { memberCount: org.memberCount } : {}),
  }
}

export function orgMemberDto(member: OrgMember) {
  return {
    accountId: member.accountId,
    email: member.email ?? null,
    role: member.role,
    joinedAt: member.joinedAt,
  }
}

export function orgInvitationDto(inv: OrgInvitation) {
  return {
    id: inv.id,
    organizationId: inv.organizationId,
    email: inv.email,
    role: inv.role,
    invitedBy: inv.invitedBy,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt ?? null,
    createdAt: inv.createdAt,
  }
}

export function orgDetailDto(detail: OrgDetail) {
  return {
    ...orgDto(detail),
    members: detail.members.map(orgMemberDto),
    pendingInvitations: detail.pendingInvitations.map(orgInvitationDto),
  }
}

/** Envelope de erro padrão da Admin REST API. */
export function apiError(code: string, message: string) {
  return { error: { code, message } }
}

import type { SettingRow } from '../runtime_settings.js'

export function settingDto(row: SettingRow) {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt ?? null),
    updatedBy: row.updatedBy ?? null,
  }
}
