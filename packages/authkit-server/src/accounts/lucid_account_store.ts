import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'
import { authenticator } from 'otplib'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type {
  AccountStore,
  AuthAccount,
  CreateAccountInput,
  LinkProviderIdentityInput,
  ListAccountsParams,
  Paginated,
  PasskeySummary,
} from './account_store.js'

/**
 * Encripta/decripta um valor (ex.: o segredo TOTP) em repouso. Mantém a lib
 * desacoplada do serviço de encryption do app — qualquer implementação que
 * faça round-trip serve (em prod, normalmente o `@adonisjs/core/services/encryption`).
 * `decrypt` retorna `null` se o valor foi adulterado/é inválido.
 */
export interface AccountSecretEncrypter {
  encrypt(value: string): string
  decrypt(value: string): string | null
}

/** Opções do {@link lucidAccountStore}. */
export interface LucidAccountStoreOptions {
  /** Label de issuer mostrado no app autenticador (keyuri). Default: 'AuthKit'. */
  mfaIssuer?: string
  /** Quantidade de recovery codes gerados no enrollment. Default: 8. */
  recoveryCodeCount?: number
  /**
   * Quando fornecido, o segredo TOTP é encriptado antes de persistir e
   * decriptado na leitura. Ausente (ex.: testes) → segredo em claro.
   */
  encrypter?: AccountSecretEncrypter
  /**
   * Model Lucid das identidades de provider (composto de `withProviderIdentity()`),
   * usado por `findByProviderIdentity`/`linkProviderIdentity` (account linking
   * social). Ausente → esses dois métodos lançam (hosts email-only continuam
   * funcionando até optarem por habilitar).
   */
  providerIdentityModel?: any
  /**
   * Model Lucid das credenciais WebAuthn / passkeys (composto de
   * `withWebauthnCredential()`), usado pelos métodos `*Passkey*`. Ausente → esses
   * métodos viram `undefined` na interface (hosts sem passkeys não mudam de
   * comportamento; a UI esconde a seção de passkeys).
   */
  webauthnCredentialModel?: any
  /**
   * Parâmetros do Relying Party (RP) usados nas cerimônias WebAuthn. Resolvidos a
   * partir do `issuer` no `define_config` quando omitidos. Necessários sempre que
   * `webauthnCredentialModel` é fornecido.
   */
  webauthn?: {
    /** Nome do RP mostrado pelo authenticator. Default: `mfaIssuer`. */
    rpName: string
    /** RP ID — normalmente o hostname (sem porta) do issuer. */
    rpId: string
    /** Origin(s) esperada(s) na verificação (scheme://host[:port]). */
    origin: string | string[]
  }
  /**
   * Seam de injeção das cerimônias WebAuthn (generate/verify). Default: as funções
   * reais do `@simplewebauthn/server`. Existe para testes (mockar a verificação SEM
   * um authenticator real) — produção não precisa fornecer.
   */
  webauthnCeremonies?: Partial<WebauthnCeremonies>
}

/**
 * Funções das cerimônias WebAuthn. Espelham a assinatura do `@simplewebauthn/server`
 * (subconjunto usado). Injetáveis via {@link LucidAccountStoreOptions.webauthnCeremonies}
 * para testes.
 */
export interface WebauthnCeremonies {
  generateRegistrationOptions: typeof generateRegistrationOptions
  verifyRegistrationResponse: typeof verifyRegistrationResponse
  generateAuthenticationOptions: typeof generateAuthenticationOptions
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')

/** Recovery code legível: 10 chars hex em duas metades (ex.: a1b2c-3d4e5). */
function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString('hex')
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`
}

/** Comparação de hashes hex resistente a timing. */
function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * Implementação default do {@link AccountStore} sobre um model Lucid composto
 * de `withAuthUser()` + `withCredentials()` (+ opcionalmente `withMfa()`). O
 * model carrega `connection`/`table` (app-específico) e, por convenção, uma
 * coluna `fullName` (mapeada de `name`).
 */
export function lucidAccountStore(
  Model: any,
  options: LucidAccountStoreOptions = {}
): AccountStore {
  const mfaIssuer = options.mfaIssuer ?? 'AuthKit'
  const recoveryCodeCount = options.recoveryCodeCount ?? 8
  const encrypter = options.encrypter
  const ProviderIdentityModel = options.providerIdentityModel
  const WebauthnCredentialModel = options.webauthnCredentialModel
  // RP do WebAuthn: usado nas cerimônias. Default do rpName cai no mfaIssuer.
  const webauthn = options.webauthn ?? {
    rpName: mfaIssuer,
    rpId: 'localhost',
    origin: 'http://localhost',
  }
  // Cerimônias WebAuthn: reais por default, injetáveis para testes.
  const ceremonies: WebauthnCeremonies = {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    ...options.webauthnCeremonies,
  }
  // Garante que o store foi configurado com o model das identidades antes de
  // tocar nos métodos de account linking (contrato: lança com mensagem clara).
  const requireProviderIdentityModel = () => {
    if (!ProviderIdentityModel) {
      throw new Error(
        'lucidAccountStore: account linking por provider identity requer a opção ' +
          '`providerIdentityModel` (um model Lucid composto de `withProviderIdentity()`).'
      )
    }
    return ProviderIdentityModel
  }
  const requireWebauthnModel = () => {
    if (!WebauthnCredentialModel) {
      throw new Error(
        'lucidAccountStore: passkeys (WebAuthn) requerem a opção ' +
          '`webauthnCredentialModel` (um model Lucid composto de `withWebauthnCredential()`).'
      )
    }
    return WebauthnCredentialModel
  }
  // Encripta o segredo antes de persistir (no-op sem encrypter).
  const sealSecret = (secret: string): string => (encrypter ? encrypter.encrypt(secret) : secret)
  // Decripta o segredo armazenado; retorna null em falha/adulteração (no-op sem encrypter).
  const openSecret = (stored: string | null | undefined): string | null => {
    if (!stored) return null
    if (!encrypter) return stored
    return encrypter.decrypt(stored)
  }
  const toAccount = (row: any): AuthAccount => ({
    id: row.id,
    email: row.email,
    globalRoles: row.globalRoles ?? [],
    name: row.fullName ?? undefined,
  })

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

    async findByProviderIdentity(provider, providerUserId) {
      const Identity = requireProviderIdentityModel()
      const identity = await Identity.query()
        .where('provider', provider)
        .where('providerUserId', providerUserId)
        .first()
      if (!identity) return null
      const row = await Model.find(identity.accountId)
      return row ? toAccount(row) : null
    },

    async linkProviderIdentity(data: LinkProviderIdentityInput) {
      const Identity = requireProviderIdentityModel()
      // Upsert idempotente na chave única (provider, providerUserId): atualiza
      // account/email se já existir, cria caso contrário.
      const existing = await Identity.query()
        .where('provider', data.provider)
        .where('providerUserId', data.providerUserId)
        .first()
      if (existing) {
        existing.accountId = data.accountId
        if (data.email !== undefined) existing.email = data.email
        await existing.save()
        return
      }
      await Identity.create({
        provider: data.provider,
        providerUserId: data.providerUserId,
        accountId: data.accountId,
        email: data.email ?? null,
      })
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

    async listAccounts(params: ListAccountsParams): Promise<Paginated<AuthAccount>> {
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

    // ----- MFA / TOTP -----

    async getMfaState(accountId) {
      const row = await Model.find(accountId)
      return { enabled: !!row?.mfaEnabledAt }
    },

    async startTotpEnrollment(accountId) {
      const row = await Model.find(accountId)
      if (!row) return null
      const secret = authenticator.generateSecret()
      // Segredo PENDENTE: armazenado (encriptado em repouso) mas mfaEnabledAt continua null.
      row.totpSecret = sealSecret(secret)
      row.mfaEnabledAt = null
      row.recoveryCodes = null
      await row.save()
      const otpauthUri = authenticator.keyuri(row.email, mfaIssuer, secret)
      return { secret, otpauthUri }
    },

    async confirmTotpEnrollment(accountId, code) {
      const row = await Model.find(accountId)
      if (!row || !row.totpSecret) return { ok: false }
      const secret = openSecret(row.totpSecret)
      if (!secret) return { ok: false }
      // Só confirma a partir de um segredo pendente (não re-confirma um já ativo).
      const valid = authenticator.verify({ token: String(code ?? ''), secret })
      if (!valid) return { ok: false }
      const codes = Array.from({ length: recoveryCodeCount }, () => generateRecoveryCode())
      row.mfaEnabledAt = DateTime.now()
      row.recoveryCodes = codes.map(sha256)
      await row.save()
      return { ok: true, recoveryCodes: codes }
    },

    async verifyTotp(accountId, code) {
      const row = await Model.find(accountId)
      if (!row || !row.mfaEnabledAt || !row.totpSecret) return false
      const secret = openSecret(row.totpSecret)
      if (!secret) return false
      return authenticator.verify({ token: String(code ?? ''), secret })
    },

    async consumeRecoveryCode(accountId, code) {
      const row = await Model.find(accountId)
      if (!row || !row.mfaEnabledAt || !Array.isArray(row.recoveryCodes)) return false
      const target = sha256(String(code ?? '').trim())
      const remaining = (row.recoveryCodes as string[]).filter((h) => !hashesEqual(h, target))
      if (remaining.length === row.recoveryCodes.length) return false // nada casou
      row.recoveryCodes = remaining
      await row.save()
      return true
    },

    async disableMfa(accountId) {
      const row = await Model.find(accountId)
      if (!row) return
      row.totpSecret = null
      row.mfaEnabledAt = null
      row.recoveryCodes = null
      await row.save()
    },

    // ----- MFA / WebAuthn (passkeys) -----

    async generatePasskeyRegistrationOptions(accountId) {
      const Credential = requireWebauthnModel()
      const row = await Model.find(accountId)
      if (!row) return null
      const existing = await Credential.query().where('accountId', accountId)
      const options = await ceremonies.generateRegistrationOptions({
        rpName: webauthn.rpName,
        rpID: webauthn.rpId,
        userName: row.email,
        userDisplayName: row.fullName ?? row.email,
        // Não pede attestation (privacidade); confia na verificação local.
        attestationType: 'none',
        // Evita registrar a mesma credencial duas vezes.
        excludeCredentials: existing.map((c: any) => ({
          id: c.id,
          transports: (c.transports ?? undefined) as any,
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      })
      return { options: options as unknown as Record<string, unknown>, challenge: options.challenge }
    },

    async verifyPasskeyRegistration(accountId, response, expectedChallenge) {
      const Credential = requireWebauthnModel()
      const row = await Model.find(accountId)
      if (!row) return false
      let verification
      try {
        verification = await ceremonies.verifyRegistrationResponse({
          response: response as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: webauthn.origin,
          expectedRPID: webauthn.rpId,
        })
      } catch {
        return false
      }
      if (!verification.verified || !verification.registrationInfo) return false

      const { credential } = verification.registrationInfo
      // publicKey vem como Uint8Array → armazenamos como base64url (texto).
      const publicKey = Buffer.from(credential.publicKey).toString('base64url')
      await Credential.create({
        id: credential.id,
        accountId,
        publicKey,
        counter: credential.counter,
        transports: credential.transports ?? null,
        label: null,
      })
      // Registrar uma passkey também habilita o MFA (2º fator presente).
      if (!row.mfaEnabledAt) {
        row.mfaEnabledAt = DateTime.now()
        await row.save()
      }
      return true
    },

    async generatePasskeyAuthenticationOptions(accountId) {
      const Credential = requireWebauthnModel()
      const creds = await Credential.query().where('accountId', accountId)
      if (creds.length === 0) return null
      const options = await ceremonies.generateAuthenticationOptions({
        rpID: webauthn.rpId,
        allowCredentials: creds.map((c: any) => ({
          id: c.id,
          transports: (c.transports ?? undefined) as any,
        })),
        userVerification: 'preferred',
      })
      return { options: options as unknown as Record<string, unknown>, challenge: options.challenge }
    },

    async verifyPasskeyAuthentication(accountId, response, expectedChallenge) {
      const Credential = requireWebauthnModel()
      const resp = response as AuthenticationResponseJSON
      // O credential id vem na resposta (base64url) → acha a credencial da conta.
      const cred = await Credential.query()
        .where('accountId', accountId)
        .where('id', resp?.id ?? '')
        .first()
      if (!cred) return false
      let verification
      try {
        verification = await ceremonies.verifyAuthenticationResponse({
          response: resp,
          expectedChallenge,
          expectedOrigin: webauthn.origin,
          expectedRPID: webauthn.rpId,
          credential: {
            id: cred.id,
            publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
            counter: cred.counter,
            transports: (cred.transports ?? undefined) as any,
          },
        })
      } catch {
        return false
      }
      if (!verification.verified) return false
      // Atualiza o signature counter (anti-replay).
      cred.counter = verification.authenticationInfo.newCounter
      await cred.save()
      return true
    },

    async listPasskeys(accountId): Promise<PasskeySummary[]> {
      const Credential = requireWebauthnModel()
      const creds = await Credential.query().where('accountId', accountId).orderBy('createdAt', 'asc')
      return creds.map((c: any) => ({
        id: c.id,
        label: c.label ?? undefined,
        createdAt: c.createdAt?.toISO?.() ?? String(c.createdAt ?? ''),
      }))
    },

    async removePasskey(accountId, credentialId) {
      const Credential = requireWebauthnModel()
      await Credential.query().where('accountId', accountId).where('id', credentialId).delete()
    },
  }
}
