import { DateTime } from 'luxon'
import { authenticator } from 'otplib'
import type { MfaCapability } from '../account_store.js'
import { generateRecoveryCode, hashesEqual, sha256, type LucidStoreContext } from './shared.js'

/**
 * Capacidade de MFA / TOTP sobre o model principal (composto de `withMfa()`).
 * Sempre presente no {@link lucidAccountStore} — o model carrega as colunas
 * `totp_secret`/`mfa_enabled_at`/`recovery_codes`.
 */
export function buildMfa(ctx: LucidStoreContext): MfaCapability {
  const { Model, mfaIssuer, recoveryCodeCount, sealSecret, openSecret } = ctx

  return {
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
  }
}
