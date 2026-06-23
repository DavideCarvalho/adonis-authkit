import type { Identity } from '@adonis-agora/authkit-core'
import { createTestIdentity } from './identity.js'

/**
 * Superfície pública do `Authenticator` do client (o que `ctx.auth` expõe).
 * Reproduzida aqui para não acoplar o pacote de testing ao client em runtime.
 */
export interface FakeAuthenticatorLike {
  getIdentity(): Promise<Identity | null>
  readonly identity: Identity | null
  authenticate(): Promise<Identity>
  check(): Promise<boolean>
  hasGlobalRole(role: string): boolean
  hasAppRole(role: string): Promise<boolean>
  getUser(): Promise<unknown>
}

export interface FakeAuthenticatorOptions {
  /** identidade resolvida; default = {@link createTestIdentity}. Passe `null` para simular anônimo. */
  identity?: Identity | null
  /** usuário de domínio retornado por `getUser()`. */
  user?: unknown
  /** roles de app reconhecidas por `hasAppRole`. */
  appRoles?: string[]
}

/**
 * Cria um objeto que satisfaz a superfície do `Authenticator` do client para
 * injetar em `ctx.auth` em testes de controller — sem resolver tokens de verdade.
 */
export function fakeAuthenticator(options: FakeAuthenticatorOptions = {}): FakeAuthenticatorLike {
  const identity: Identity | null =
    options.identity === undefined ? createTestIdentity() : options.identity
  const appRoles = options.appRoles ?? []
  const user = 'user' in options ? options.user : identity

  return {
    async getIdentity() {
      return identity
    },
    get identity() {
      return identity
    },
    async authenticate() {
      if (!identity) throw new Error('Não autenticado')
      return identity
    },
    async check() {
      return identity !== null
    },
    hasGlobalRole(role: string) {
      return identity?.globalRoles.includes(role) ?? false
    },
    async hasAppRole(role: string) {
      if (!identity) return false
      return appRoles.includes(role)
    },
    async getUser() {
      if (!identity) return null
      return user
    },
  }
}
