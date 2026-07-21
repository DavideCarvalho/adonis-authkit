/** Nomes canônicos das métricas OTel emitidas pela lib (usados no Plano 3). */
export const AUTHKIT_METRICS = {
  loginSuccess: 'authkit.login.success',
  loginFailure: 'authkit.login.failure',
  tokenIssued: 'authkit.token.issued',
  refreshRotated: 'authkit.refresh.rotated',
  grantRevoked: 'authkit.grant.revoked',
  sessionsActive: 'authkit.sessions.active',
  passwordHashDuration: 'authkit.password.hash.duration',
  resolveDuration: 'authkit.resolve.duration',
  resolveErrors: 'authkit.resolve.errors',
  jwksRefresh: 'authkit.jwks.refresh',
  tokenRefresh: 'authkit.token.refresh',
} as const;

export type AuthkitMetricName = (typeof AUTHKIT_METRICS)[keyof typeof AUTHKIT_METRICS];
