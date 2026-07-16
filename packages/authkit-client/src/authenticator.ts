import type { Identity, SessionResolver } from "@adonis-agora/authkit-core";
import { AUTHKIT_METRICS, type MetricsRecorder, NoopRecorder } from "@adonis-agora/authkit-core";
import type { HttpContext } from "@adonisjs/core/http";
import { populateContext } from "./observability/context_bridge.js";

/** Contexto opcional repassado a `resolveUser` (extensão backward-compatible). */
export interface ResolveUserContext {
  accessToken?: string;
}

export interface AuthenticatorDeps {
  resolver: SessionResolver;
  resolveUser?: (identity: Identity, context: ResolveUserContext) => Promise<unknown>;
  /** lê o access token do token set da sessão (opcional; usado por resolvers userinfo) */
  getAccessToken?: () => string | null | undefined;
}

export class Authenticator {
  #identity: Identity | null = null;
  #resolved = false;
  #user: unknown;
  #userResolved = false;

  #recorder: MetricsRecorder;

  constructor(
    private ctx: HttpContext,
    private deps: AuthenticatorDeps,
    recorder: MetricsRecorder = new NoopRecorder(),
  ) {
    this.#recorder = recorder;
  }

  async getIdentity(): Promise<Identity | null> {
    if (!this.#resolved) {
      const start = Date.now();
      try {
        this.#identity = await this.deps.resolver.resolve(this.ctx);
      } catch (error) {
        this.#recorder.increment(AUTHKIT_METRICS.resolveErrors);
        throw error;
      } finally {
        this.#recorder.record(AUTHKIT_METRICS.resolveDuration, Date.now() - start);
      }
      this.#resolved = true;
      // Ponte estrutural: popula o contexto do Agora quando há sessão de fato
      // (best-effort, no-op sem o slot `@agora/context:set`). Apenas no caminho
      // de sucesso — não força resolução para requests anônimas.
      if (this.#identity) populateContext(this.#identity);
    }
    return this.#identity;
  }

  get identity(): Identity | null {
    return this.#identity;
  }

  async authenticate(): Promise<Identity> {
    const identity = await this.getIdentity();
    if (!identity) throw new Error("Not authenticated");
    return identity;
  }

  async check(): Promise<boolean> {
    return (await this.getIdentity()) !== null;
  }

  hasGlobalRole(role: string): boolean {
    return this.#identity?.globalRoles.includes(role) ?? false;
  }

  async getUser(): Promise<unknown> {
    if (this.#userResolved) return this.#user;
    const identity = await this.getIdentity();
    if (identity && this.deps.resolveUser) {
      const accessToken = this.deps.getAccessToken?.() ?? undefined;
      this.#user = await this.deps.resolveUser(identity, { accessToken });
    } else {
      this.#user = null;
    }
    this.#userResolved = true;
    return this.#user;
  }

  /**
   * Monta o objeto pronto para compartilhar com o frontend (ex.: Inertia share),
   * casando com o `AuthSharedProps` que o `@adonis-agora/authkit-react` consome.
   * Retorna `null` quando não há sessão. Autorização (roles de app/permissões)
   * é responsabilidade do `@adonis-agora/authz` — o AuthKit só autentica.
   */
  async toSharedProps(): Promise<{
    user: unknown;
    globalRoles: string[];
  } | null> {
    const identity = await this.getIdentity();
    if (!identity) return null;
    const user = await this.getUser();
    return { user, globalRoles: identity.globalRoles ?? [] };
  }
}
