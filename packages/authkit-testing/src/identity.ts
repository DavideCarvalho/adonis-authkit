import type { Identity } from '@adonis-agora/authkit-core'

/**
 * Cria uma {@link Identity} válida com valores padrão sãos para usar em testes.
 * Sobrescreva qualquer campo via `overrides`.
 */
export function createTestIdentity(overrides: Partial<Identity> = {}): Identity {
  const now = Date.now()
  return {
    userId: 'test-user-id',
    email: 'test@example.com',
    globalRoles: [],
    profile: { name: 'Test User', avatarUrl: undefined },
    sessionId: 'test-session-id',
    issuedAt: now,
    expiresAt: now + 60 * 60 * 1000,
    raw: {},
    ...overrides,
  }
}
