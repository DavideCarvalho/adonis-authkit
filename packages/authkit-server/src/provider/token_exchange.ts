import { errors } from 'oidc-provider'
import type { AuditSink } from '../audit/audit_sink.js'

const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

export interface TokenExchangeAccount {
  id: string
  email?: string
  name?: string
  globalRoles?: string[]
}

export interface TokenExchangeDeps {
  findAccount: (sub: string) => Promise<TokenExchangeAccount | null>
  globalRolesClaim: string
  adminRole?: string
  /** Sink de auditoria (best-effort). Quando presente, registra `impersonation`. */
  audit?: AuditSink
}

export function registerTokenExchange(provider: any, deps: TokenExchangeDeps): void {
  const adminRole = deps.adminRole ?? 'ADMIN'

  const handler = async (ctx: any) => {
    const { params, client } = ctx.oidc

    if (params.subject_token_type !== ACCESS_TOKEN_TYPE) {
      throw new errors.InvalidRequest('unsupported subject_token_type')
    }
    if (!params.subject_token) {
      throw new errors.InvalidRequest('subject_token is required')
    }

    const subjectAt = await provider.AccessToken.find(params.subject_token)
    if (!subjectAt || subjectAt.isExpired) {
      throw new errors.InvalidGrant('subject_token invalid or expired')
    }

    const actor = await deps.findAccount(subjectAt.accountId)
    if (!actor || !(actor.globalRoles ?? []).includes(adminRole)) {
      throw new errors.InvalidGrant('actor not permitted to impersonate')
    }

    const targetId = params.requested_subject
    if (!targetId) {
      throw new errors.InvalidRequest('requested_subject is required')
    }
    const target = await deps.findAccount(targetId)
    if (!target) {
      throw new errors.InvalidGrant('requested_subject not found')
    }

    const scope = params.scope || 'openid profile email'

    const at = new provider.AccessToken({ accountId: target.id, client, scope })
    const accessToken = await at.save()

    const idToken = new provider.IdToken(
      {
        sub: target.id,
        email: target.email,
        email_verified: true,
        name: target.name,
        [deps.globalRolesClaim]: target.globalRoles ?? [],
      },
      { ctx }
    )
    idToken.scope = scope
    idToken.set('act', { sub: actor.id })
    const idTokenJwt = await idToken.issue({ use: 'idtoken' })

    await deps.audit?.record({
      type: 'impersonation',
      actorId: actor.id,
      accountId: target.id,
      email: target.email ?? null,
      clientId: client?.clientId ?? null,
      ip: ctx.req?.socket?.remoteAddress ?? null,
      metadata: { scope },
    })

    ctx.body = {
      access_token: accessToken,
      issued_token_type: ACCESS_TOKEN_TYPE,
      token_type: at.tokenType ?? 'Bearer',
      expires_in: at.expiration ?? 3600,
      id_token: idTokenJwt,
      scope,
    }
  }

  provider.registerGrantType(
    TOKEN_EXCHANGE,
    handler,
    [
      'subject_token',
      'subject_token_type',
      'requested_subject',
      'requested_token_type',
      'scope',
      'audience',
      'resource',
      'actor_token',
      'actor_token_type',
    ],
    ['audience', 'resource']
  )
}
