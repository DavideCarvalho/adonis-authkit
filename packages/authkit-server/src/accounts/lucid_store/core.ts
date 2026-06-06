import { randomBytes } from 'node:crypto'
import { DateTime } from 'luxon'
import type {
  AccountImportCapability,
  AccountSecurityCapability,
  CoreAccountStore,
  CreateAccountInput,
  MagicLinkCapability,
} from '../account_store.js'
import type { LucidStoreContext } from './shared.js'
import { hasColumn } from './status_profile.js'

/** Prefixo do token de troca de e-mail (reaproveita a coluna emailVerificationToken). */
const EMAIL_CHANGE_PREFIX = 'ec:'

/** Prefixo do magic link (reaproveita as colunas de reset de senha). */
const MAGIC_LINK_PREFIX = 'ml:'

/**
 * Núcleo SEMPRE presente do {@link CoreAccountStore} sobre um model Lucid:
 * identidade, cadastro, reset de senha, verificação de e-mail, administração
 * (listagem paginada + roles globais) e o self-service de segurança
 * ({@link AccountSecurityCapability}: trocar senha/e-mail).
 */
export function buildCore(
  ctx: LucidStoreContext
): CoreAccountStore & AccountSecurityCapability & MagicLinkCapability & AccountImportCapability {
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
      if (!row) return null
      const result = await ctx.passwords.verify(row.password, password, {
        nativeVerify: (_hashed: string, plain: string) => row.verifyPassword(plain),
        needsRehash: () => row.passwordNeedsRehash(),
      })
      if (!result.ok) return null
      // Lazy rehash transparente (padrão Auth0/Clerk): senha confere mas o hash
      // está em formato legado OU com parâmetros desatualizados → re-hasheia com o
      // hasher atual e persiste. Best-effort: uma falha no rehash NÃO falha o login.
      if (result.rehash) {
        try {
          row.password = password // o @beforeSave do mixin re-hasheia
          await row.save()
          await ctx.audit?.record({ type: 'password.rehashed', accountId: row.id })
        } catch {
          // ignora — o usuário já está autenticado; o rehash tentará de novo no próximo login.
        }
      }
      return toAccount(row)
    },

    async create(input: CreateAccountInput) {
      // Aplica a política de senha (comprimento/complexidade + vazamento) à senha
      // nova. Lança PasswordPolicyError quando viola — o controller traduz a chave.
      await ctx.passwords.assertAcceptable(input.password)
      // Aplica o pepper antes do hash (o @beforeSave do mixin hasheia o que receber).
      const pepperedPassword = ctx.passwords.applyCurrentPepper(input.password)
      const now = DateTime.now()
      const row = await Model.create({
        email: input.email,
        password: pepperedPassword,
        fullName: input.fullName ?? null,
        globalRoles: input.globalRoles ?? [],
        emailVerifiedAt: input.emailVerified ? now : null,
        // Registra quando a senha foi definida (se a coluna existe).
        ...(hasColumn(Model, 'passwordChangedAt') ? { passwordChangedAt: now } : {}),
      })
      return toAccount(row)
    },

    async importAccount(input) {
      // Skip se o e-mail já existe (idempotência do import).
      const existing = await Model.query().where('email', input.email).first()
      if (existing) return null
      // Cria com uma senha aleatória (que o @beforeSave hasheia) só para satisfazer
      // a coluna NOT NULL; em seguida sobrescreve com o hash de ORIGEM via query
      // builder (bypassa o @beforeSave, então o hash entra COMO ESTÁ — o lazy rehash
      // no 1º login migra para o hasher atual). NÃO aplica a política de senha.
      const row = await Model.create({
        email: input.email,
        password: randomBytes(24).toString('hex'),
        fullName: input.fullName ?? null,
        globalRoles: input.globalRoles ?? [],
        emailVerifiedAt: input.emailVerified ? DateTime.now() : null,
      })
      if (input.passwordHash) {
        await Model.query().where('id', row.id).update({ password: input.passwordHash })
        row.password = input.passwordHash
        // Limpa o dirty para que um save futuro não re-hasheie este hash de origem.
        row.$attributes.password = input.passwordHash
      }
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
      // Magic links (`ml:`) NÃO são tokens de reset de senha — só o fluxo de
      // consumeMagicLinkToken pode consumi-los (não trocam senha).
      if (token.startsWith(MAGIC_LINK_PREFIX)) return false
      const row = await Model.query().where('passwordResetToken', token).first()
      if (!row) return false
      if (!row.passwordResetExpiresAt || row.passwordResetExpiresAt < DateTime.now()) return false
      // Política de senha aplicada também no reset (lança PasswordPolicyError).
      await ctx.passwords.assertAcceptable(newPassword)
      // Aplica o pepper antes do hash.
      row.password = ctx.passwords.applyCurrentPepper(newPassword)
      row.passwordResetToken = null
      row.passwordResetExpiresAt = null
      // Atualiza o timestamp da última troca (se a coluna existe).
      if (hasColumn(Model, 'passwordChangedAt')) {
        row.passwordChangedAt = DateTime.now()
      }
      await row.save()
      return true
    },

    // ----- Magic link (login passwordless) -----

    async issueMagicLinkToken(email) {
      const row = await Model.query().where('email', email).first()
      if (!row) return null
      // Token `ml:<random>` nas colunas de reset (sem migração); o prefixo o
      // distingue de um token de reset de senha. Curta duração (15 min).
      const token = `${MAGIC_LINK_PREFIX}${randomBytes(32).toString('hex')}`
      row.passwordResetToken = token
      row.passwordResetExpiresAt = DateTime.now().plus({ minutes: 15 })
      await row.save()
      return { token, account: toAccount(row) }
    },

    async consumeMagicLinkToken(token) {
      if (!token || !token.startsWith(MAGIC_LINK_PREFIX)) return null
      const row = await Model.query().where('passwordResetToken', token).first()
      if (!row) return null
      if (!row.passwordResetExpiresAt || row.passwordResetExpiresAt < DateTime.now()) return null
      // Single-use: limpa o token (NÃO altera a senha).
      row.passwordResetToken = null
      row.passwordResetExpiresAt = null
      await row.save()
      return toAccount(row)
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
      // Política de senha aplicada na troca (lança PasswordPolicyError).
      await ctx.passwords.assertAcceptable(newPassword)
      // O hash acontece no @beforeSave do mixin withAuthUser ao detectar $dirty.password.
      // Aplica o pepper antes do hash.
      const pepperedNew = ctx.passwords.applyCurrentPepper(newPassword)
      row.password = pepperedNew
      // Atualiza o timestamp da última troca (se a coluna existe).
      if (hasColumn(Model, 'passwordChangedAt')) {
        row.passwordChangedAt = DateTime.now()
      }
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
      // Captura o e-mail antigo ANTES de sobrescrever (para notificações de segurança).
      const oldEmail = row.email as string
      row.email = newEmail
      row.emailVerifiedAt = DateTime.now()
      row.emailVerificationToken = null
      await row.save()
      return { ok: true as const, account: toAccount(row), oldEmail, newEmail }
    },
  }
}
