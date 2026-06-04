import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type {
  AccountSecurityCapability,
  CoreAccountStore,
  CreateAccountInput,
} from '../account_store.js'
import type { LucidStoreContext } from './shared.js'

/** Prefixo do token de troca de e-mail (reaproveita a coluna emailVerificationToken). */
const EMAIL_CHANGE_PREFIX = 'ec:'

/**
 * Núcleo SEMPRE presente do {@link CoreAccountStore} sobre um model Lucid:
 * identidade, cadastro, reset de senha, verificação de e-mail, administração
 * (listagem paginada + roles globais) e o self-service de segurança
 * ({@link AccountSecurityCapability}: trocar senha/e-mail).
 */
export function buildCore(ctx: LucidStoreContext): CoreAccountStore & AccountSecurityCapability {
  const { Model, toAccount } = ctx

  return {
    async findById(id) {
      const row = await Model.find(id)
      return row ? toAccount(row) : null
    },

    async findByEmail(email) {
      const row = await Model.query().where('email', email).first()
      return row ? toAccount(row) : null
    },

    async verifyCredentials(email, password) {
      const row = await Model.query().where('email', email).first()
      if (!row || !(await row.verifyPassword(password))) return null
      return toAccount(row)
    },

    async create(input: CreateAccountInput) {
      const row = await Model.create({
        email: input.email,
        password: input.password,
        fullName: input.fullName ?? null,
        globalRoles: input.globalRoles ?? [],
        emailVerifiedAt: input.emailVerified ? DateTime.now() : null,
      })
      return toAccount(row)
    },

    async issuePasswordResetToken(email) {
      const row = await Model.query().where('email', email).first()
      if (!row) return null
      const token = randomBytes(32).toString('hex')
      row.passwordResetToken = token
      row.passwordResetExpiresAt = DateTime.now().plus({ hours: 1 })
      await row.save()
      return { token, account: toAccount(row) }
    },

    async consumePasswordResetToken(token, newPassword) {
      const row = await Model.query().where('passwordResetToken', token).first()
      if (!row) return false
      if (!row.passwordResetExpiresAt || row.passwordResetExpiresAt < DateTime.now()) return false
      row.password = newPassword
      row.passwordResetToken = null
      row.passwordResetExpiresAt = null
      await row.save()
      return true
    },

    async issueEmailVerificationToken(email) {
      const row = await Model.query().where('email', email).first()
      if (!row) return null
      const token = randomBytes(32).toString('hex')
      row.emailVerificationToken = token
      await row.save()
      return { token, account: toAccount(row) }
    },

    async consumeEmailVerificationToken(token) {
      if (!token) return false
      // Tokens de troca de e-mail (`ec:`) NÃO são verificações de cadastro — só o
      // fluxo de confirmEmailChange pode consumi-los.
      if (token.startsWith(EMAIL_CHANGE_PREFIX)) return false
      const row = await Model.query().where('emailVerificationToken', token).first()
      if (!row) return false
      row.emailVerifiedAt = DateTime.now()
      row.emailVerificationToken = null
      await row.save()
      return true
    },

    // ----- Administração (console admin) -----

    async listAccounts(params) {
      const page = Math.max(1, params.page ?? 1)
      const limit = Math.max(1, params.limit ?? 20)
      const search = params.search?.trim()

      const base = () => {
        const q = Model.query()
        // Filtro por e-mail (substring, case-insensitive). `whereILike` cai no LIKE
        // no sqlite (case-insensitive por default p/ ASCII), e em ILIKE no Postgres.
        if (search) q.whereILike('email', `%${search}%`)
        return q
      }

      const countResult = await base().count('* as total')
      // O shape do count varia por dialeto; lê de $extras.total (Lucid).
      const total = Number(countResult[0]?.$extras?.total ?? 0)

      const rows = await base()
        .orderBy('email', 'asc')
        .offset((page - 1) * limit)
        .limit(limit)

      return { data: rows.map(toAccount), total }
    },

    async setGlobalRoles(accountId, roles) {
      const row = await Model.find(accountId)
      if (!row) return
      // A coluna `globalRoles` é serializada como JSON pelo mixin withAuthUser.
      row.globalRoles = roles
      await row.save()
    },

    // ----- Self-service de segurança (console de conta) -----

    async changePassword(accountId, newPassword) {
      const row = await Model.find(accountId)
      if (!row) return false
      // O hash acontece no @beforeSave do mixin withAuthUser ao detectar $dirty.password.
      row.password = newPassword
      await row.save()
      return true
    },

    async requestEmailChange(accountId, newEmail) {
      const row = await Model.find(accountId)
      if (!row) return null
      // Não permite tomar um e-mail já usado por OUTRA conta.
      const taken = await Model.query().where('email', newEmail).first()
      if (taken && taken.id !== row.id) return null
      // Token = `ec:<base64url(newEmail)>:<random>`. Reaproveita a coluna
      // emailVerificationToken (sem migração nova); o prefixo `ec:` distingue do
      // token de verificação de cadastro. O e-mail viaja codificado no próprio
      // token, então não precisamos de coluna extra para o "pending email".
      const encodedEmail = Buffer.from(newEmail, 'utf8').toString('base64url')
      const token = `${EMAIL_CHANGE_PREFIX}${encodedEmail}:${randomBytes(24).toString('hex')}`
      row.emailVerificationToken = token
      await row.save()
      return { token, account: toAccount(row), newEmail }
    },

    async confirmEmailChange(token) {
      if (!token || !token.startsWith(EMAIL_CHANGE_PREFIX)) return { ok: false as const }
      const parts = token.split(':')
      // Forma esperada: ['ec', '<b64email>', '<random>']
      if (parts.length !== 3) return { ok: false as const }
      let newEmail: string
      try {
        newEmail = Buffer.from(parts[1], 'base64url').toString('utf8')
      } catch {
        return { ok: false as const }
      }
      if (!newEmail) return { ok: false as const }
      const row = await Model.query().where('emailVerificationToken', token).first()
      if (!row) return { ok: false as const }
      // Defesa contra corrida: o e-mail pode ter sido tomado entre o pedido e a
      // confirmação por outra conta.
      const taken = await Model.query().where('email', newEmail).first()
      if (taken && taken.id !== row.id) return { ok: false as const }
      row.email = newEmail
      row.emailVerifiedAt = DateTime.now()
      row.emailVerificationToken = null
      await row.save()
      return { ok: true as const, account: toAccount(row), newEmail }
    },
  }
}
