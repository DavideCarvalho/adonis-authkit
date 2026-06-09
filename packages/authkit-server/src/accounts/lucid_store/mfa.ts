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
      // `enabledAt` (epoch ms) habilita o trusted-device check: um cookie de
      // confiança emitido ANTES deste instante é inválido (re-enrolar revoga).
      const enabledAt = row?.mfaEnabledAt ? row.mfaEnabledAt.toMillis() : null
      return { enabled: !!row?.mfaEnabledAt, enabledAt }
    },

    async startTotpEnrollment(accountId) {
      const row = await Model.find(accountId)
      if (!row) return null
      const secret = authenticator.generateSecret()
      // Segredo PENDENTE: armazenado (encriptado em repouso) mas mfaEnabledAt continua null.
      row.totpSecret = sealSecret(secret)
      row.mfaEnabledAt = null
      row.recoveryCodes = null
      // Re-enrollment: zera o anti-replay para o NOVO segredo (o histórico de
      // steps do segredo antigo não se aplica ao novo).
      row.lastTotpStep = null
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
      const token = String(code ?? '')

      // M3 (anti-replay): `checkDelta` retorna o offset (delta) da janela onde o
      // token bate, ou null se inválido. Convertemos o delta no índice ABSOLUTO
      // da janela (`step`) usando o epoch/period correntes do otplib:
      //   stepAtual = floor(epochSegundos / period)
      //   stepDoToken = stepAtual + delta
      const delta = authenticator.checkDelta(token, secret)
      if (delta === null) return false

      const opts = authenticator.allOptions()
      // `epoch` vem em ms; `step` (period) em segundos. Default do otplib: epoch=now, step=30.
      const period = opts.step || 30
      const currentStep = Math.floor(opts.epoch / 1000 / period)
      const tokenStep = currentStep + delta

      // Rejeita replay: se este step já foi aceito (ou um posterior), nega. Isso
      // impede reusar o MESMO código dentro da janela de validade (~30s) e também
      // qualquer código de um step já consumido.
      const last = typeof row.lastTotpStep === 'number' ? row.lastTotpStep : null
      if (last !== null && tokenStep <= last) return false

      // Sucesso: persiste o step aceito para barrar o próximo replay.
      row.lastTotpStep = tokenStep
      await row.save()
      return true
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
      // Limpa também o anti-replay: um futuro re-enroll começa do zero.
      row.lastTotpStep = null
      await row.save()
    },
  }
}
