import type { HttpContext } from '@adonisjs/core/http'

/**
 * Identidade resolvida por request a partir das claims OIDC validadas.
 * Fronteira: só identidade (claims globais) — nada de domínio do app.
 */
export interface Identity {
  /** claim `sub` */
  userId: string
  email: string
  /** papéis globais, de uma claim custom (ex.: `roles`) */
  globalRoles: string[]
  /** claims OIDC padrão de perfil */
  profile?: { name?: string; avatarUrl?: string }
  /** `sid` quando presente */
  sessionId?: string
  /** `iat` em epoch ms */
  issuedAt: number
  /** `exp` em epoch ms */
  expiresAt: number
  /** claims completas (escape hatch) */
  raw: Record<string, unknown>
}

/**
 * Contrato do driver de resolução de sessão (estratégia por request).
 * v1 do client implementa `resolvers.jwt()`.
 */
export interface SessionResolver {
  resolve(ctx: HttpContext): Promise<Identity | null>
}
