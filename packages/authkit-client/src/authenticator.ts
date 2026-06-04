import type { HttpContext } from '@adonisjs/core/http'
import type { Identity, SessionResolver } from '@dudousxd/adonis-authkit-core'
import { AUTHKIT_METRICS, NoopRecorder, type MetricsRecorder } from '@dudousxd/adonis-authkit-core'

/** Contexto opcional repassado a `resolveUser` (extensão backward-compatible). */
export interface ResolveUserContext {
  accessToken?: string
}

export interface AuthenticatorDeps {
  resolver: SessionResolver
  resolveUser?: (identity: Identity, context: ResolveUserContext) => Promise<unknown>
  resolveAppRoles?: (identity: Identity) => Promise<string[]>
  /** lê o access token do token set da sessão (opcional; usado por resolvers userinfo) */
  getAccessToken?: () => string | null | undefined
}

export class Authenticator {
  #identity: Identity | null = null
  #resolved = false
  #user: unknown
  #userResolved = false
  #appRoles: string[] | null = null

  #recorder: MetricsRecorder

  constructor(
    private ctx: HttpContext,
    private deps: AuthenticatorDeps,
    recorder: MetricsRecorder = new NoopRecorder()
  ) {
    this.#recorder = recorder
  }

  async getIdentity(): Promise<Identity | null> {
    if (!this.#resolved) {
      const start = Date.now()
      try {
        this.#identity = await this.deps.resolver.resolve(this.ctx)
      } catch (error) {
        this.#recorder.increment(AUTHKIT_METRICS.resolveErrors)
        throw error
      } finally {
        this.#recorder.record(AUTHKIT_METRICS.resolveDuration, Date.now() - start)
      }
      this.#resolved = true
    }
    return this.#identity
  }

  get identity(): Identity | null {
    return this.#identity
  }

  async authenticate(): Promise<Identity> {
    const identity = await this.getIdentity()
    if (!identity) throw new Error('Não autenticado')
    return identity
  }

  async check(): Promise<boolean> {
    return (await this.getIdentity()) !== null
  }

  hasGlobalRole(role: string): boolean {
    return this.#identity?.globalRoles.includes(role) ?? false
  }

  async hasAppRole(role: string): Promise<boolean> {
    const identity = await this.getIdentity()
    if (!identity || !this.deps.resolveAppRoles) return false
    if (this.#appRoles === null) this.#appRoles = await this.deps.resolveAppRoles(identity)
    return this.#appRoles.includes(role)
  }

  async getUser(): Promise<unknown> {
    if (this.#userResolved) return this.#user
    const identity = await this.getIdentity()
    if (identity && this.deps.resolveUser) {
      const accessToken = this.deps.getAccessToken?.() ?? undefined
      this.#user = await this.deps.resolveUser(identity, { accessToken })
    } else {
      this.#user = null
    }
    this.#userResolved = true
    return this.#user
  }
}
