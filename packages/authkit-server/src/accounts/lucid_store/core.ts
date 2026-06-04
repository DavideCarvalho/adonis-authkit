import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type { CoreAccountStore, CreateAccountInput } from '../account_store.js'
import type { LucidStoreContext } from './shared.js'

/**
 * Núcleo SEMPRE presente do {@link CoreAccountStore} sobre um model Lucid:
 * identidade, cadastro, reset de senha, verificação de e-mail e administração
 * (listagem paginada + roles globais).
 */
export function buildCore(ctx: LucidStoreContext): CoreAccountStore {
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
  }
}
