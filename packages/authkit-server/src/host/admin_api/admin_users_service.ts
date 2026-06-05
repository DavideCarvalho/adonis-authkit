import { randomBytes } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import type { ResolvedServerConfig } from '../../define_config.js'
import type { AuthAccount } from '../../accounts/account_store.js'
import { supportsAccountStatus, supportsProfile } from '../../accounts/account_store.js'
import { sendPasswordResetEmail } from '../default_mailer.js'

/** Quem disparou a operação (para auditoria). `admin-api` quando via REST API. */
export interface AdminActor {
  actorId: string | null
  ip: string | null
  /** Marca metadata da auditoria — 'admin-api' nas escritas via REST. */
  source?: 'admin-api'
}

export interface CreateUserInput {
  email: string
  name?: string | null
  password?: string | null
  /** Quando true (e sem password), cria com senha aleatória e envia convite/reset. */
  invite?: boolean
}

export type CreateUserResult =
  | { ok: true; account: AuthAccount; invited: boolean }
  | { ok: false; reason: 'email_taken' }

/**
 * Lógica de gestão de usuários compartilhada entre o console admin (B6, HTML) e a
 * Admin REST API (R6, JSON). Encapsula o fluxo "create + invite", reset de senha,
 * troca de status e atualização de perfil/roles — todos auditando com o `actor`
 * informado (`admin-api` nas chamadas REST).
 */
export class AdminUsersService {
  constructor(private cfg: ResolvedServerConfig) {}

  /**
   * Cria uma conta. Com `password`: já nasce com a senha. Sem `password` (ou
   * `invite: true`): cria com senha aleatória forte e dispara o e-mail de reset
   * (o usuário define a própria). Audita `user.created`.
   */
  async create(ctx: HttpContext, input: CreateUserInput, actor: AdminActor): Promise<CreateUserResult> {
    const store = this.cfg.accountStore
    const existing = await store.findByEmail(input.email)
    if (existing) return { ok: false, reason: 'email_taken' }

    const hasPassword = !!input.password
    const initialPassword = input.password ?? randomBytes(24).toString('hex')
    const account = await store.create({
      email: input.email,
      password: initialPassword,
      fullName: input.name ?? null,
    })

    await this.cfg.audit?.record({
      type: 'user.created',
      accountId: account.id,
      email: input.email,
      actorId: actor.actorId,
      ip: actor.ip,
      metadata: { invited: !hasPassword, ...(actor.source ? { actor: actor.source } : {}) },
    })

    if (!hasPassword) {
      await this.sendResetEmail(ctx, account.email)
    }
    return { ok: true, account, invited: !hasPassword }
  }

  /** Emite token de reset + envia e-mail. Retorna a conta (ou null se inexistente). */
  async resetPassword(ctx: HttpContext, accountId: string, actor: AdminActor): Promise<AuthAccount | null> {
    const account = await this.cfg.accountStore.findById(accountId)
    if (!account) return null
    await this.sendResetEmail(ctx, account.email)
    await this.cfg.audit?.record({
      type: 'user.password_reset_sent',
      accountId,
      email: account.email,
      actorId: actor.actorId,
      ip: actor.ip,
      ...(actor.source ? { metadata: { actor: actor.source } } : {}),
    })
    return account
  }

  /**
   * Habilita/desabilita uma conta. Retorna false quando o store não suporta a
   * capacidade (o caller responde 409). Audita `user.disabled`/`user.enabled`.
   */
  async setStatus(accountId: string, disable: boolean, actor: AdminActor): Promise<boolean> {
    const store = this.cfg.accountStore
    if (!supportsAccountStatus(store)) return false
    if (disable) await store.disableAccount(accountId)
    else await store.enableAccount(accountId)
    await this.cfg.audit?.record({
      type: disable ? 'user.disabled' : 'user.enabled',
      accountId,
      actorId: actor.actorId,
      ip: actor.ip,
      ...(actor.source ? { metadata: { actor: actor.source } } : {}),
    })
    return true
  }

  /** Substitui as roles globais de uma conta (normaliza nada — recebe array pronto). */
  async setGlobalRoles(accountId: string, roles: string[]): Promise<void> {
    await this.cfg.accountStore.setGlobalRoles(accountId, roles)
  }

  /** Atualiza nome/avatar (capacidade opcional). Retorna a conta ou null. */
  async updateProfile(
    accountId: string,
    patch: { name?: string | null; avatarUrl?: string | null }
  ): Promise<AuthAccount | null> {
    const store = this.cfg.accountStore
    if (!supportsProfile(store)) return null
    return store.updateProfile(accountId, patch)
  }

  /** Indica se a conta está desabilitada (false quando a capacidade não existe). */
  async isDisabled(accountId: string): Promise<boolean> {
    const store = this.cfg.accountStore
    return supportsAccountStatus(store) ? store.isDisabled(accountId) : false
  }

  /** Emite o token de reset e dispara o e-mail (hook do config tem prioridade). */
  private async sendResetEmail(ctx: HttpContext, email: string): Promise<void> {
    const issued = await this.cfg.accountStore.issuePasswordResetToken(email)
    if (!issued) return
    const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
    const resetUrl = `${origin}/auth/reset-password?token=${encodeURIComponent(issued.token)}`
    if (this.cfg.mail?.onPasswordReset) {
      await this.cfg.mail.onPasswordReset({ email, resetUrl, token: issued.token })
    } else {
      await sendPasswordResetEmail(ctx, { email, resetUrl })
    }
  }
}
