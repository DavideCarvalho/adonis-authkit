import { authenticator } from 'otplib'
import type { MfaCapability } from '../account_store.js'
import {
  generateRecoveryCode,
  hashesEqual,
  sha256,
  buildMfaStateRepo,
  type LucidStoreContext,
} from './shared.js'

/**
 * Capacidade de MFA / TOTP — LIB-OWNED.
 *
 * O estado de MFA (`totp_secret`, `mfa_enabled_at`, `recovery_codes`,
 * `last_totp_step`) vive numa tabela PRÓPRIA auto-gerida `auth_mfa` (criada pelo
 * {@link ensureAuthkitSchema}), keyed por `account_id`. O host NÃO precisa migrar
 * nada — `withMfa()` continua componível no model mas não declara mais colunas.
 *
 * Acesso ao banco via a CONEXÃO do próprio model (`Model.query().client`), a mesma
 * usada pelo restante do store. O `email` (para o keyuri/QR) continua vindo do
 * model principal — só o ESTADO de MFA migrou para `auth_mfa`.
 */
export function buildMfa(ctx: LucidStoreContext): MfaCapability {
  const { Model, mfaIssuer, recoveryCodeCount, sealSecret, openSecret } = ctx
  const repo = buildMfaStateRepo(Model)

  return {
    async getMfaState(accountId) {
      const state = await repo.read(accountId)
      // `enabledAt` (epoch ms) habilita o trusted-device check: um cookie de
      // confiança emitido ANTES deste instante é inválido (re-enrolar revoga).
      return { enabled: !!state?.mfaEnabledAt, enabledAt: state?.mfaEnabledAt ?? null }
    },

    async startTotpEnrollment(accountId) {
      // O email/QR vem do model principal; só o ESTADO de MFA vive em auth_mfa.
      const row = await Model.find(accountId)
      if (!row) return null
      const secret = authenticator.generateSecret()
      // Segredo PENDENTE: armazenado (encriptado em repouso) mas mfaEnabledAt continua null.
      // Re-enrollment: zera o anti-replay para o NOVO segredo (o histórico de steps
      // do segredo antigo não se aplica ao novo) e limpa recovery codes pendentes.
      await repo.upsert(accountId, {
        totpSecret: sealSecret(secret),
        mfaEnabledAt: null,
        recoveryCodes: null,
        lastTotpStep: null,
      })
      const otpauthUri = authenticator.keyuri(row.email, mfaIssuer, secret)
      return { secret, otpauthUri }
    },

    async confirmTotpEnrollment(accountId, code) {
      const state = await repo.read(accountId)
      if (!state || !state.totpSecret) return { ok: false }
      const secret = openSecret(state.totpSecret)
      if (!secret) return { ok: false }
      // Só confirma a partir de um segredo pendente (não re-confirma um já ativo).
      const valid = authenticator.verify({ token: String(code ?? ''), secret })
      if (!valid) return { ok: false }
      const codes = Array.from({ length: recoveryCodeCount }, () => generateRecoveryCode())
      await repo.upsert(accountId, {
        mfaEnabledAt: Date.now(),
        recoveryCodes: codes.map(sha256),
      })
      return { ok: true, recoveryCodes: codes }
    },

    async verifyTotp(accountId, code) {
      const state = await repo.read(accountId)
      if (!state || !state.mfaEnabledAt || !state.totpSecret) return false
      const secret = openSecret(state.totpSecret)
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
      const last = typeof state.lastTotpStep === 'number' ? state.lastTotpStep : null
      if (last !== null && tokenStep <= last) return false

      // Sucesso: persiste o step aceito para barrar o próximo replay.
      await repo.upsert(accountId, { lastTotpStep: tokenStep })
      return true
    },

    async consumeRecoveryCode(accountId, code) {
      const state = await repo.read(accountId)
      if (!state || !state.mfaEnabledAt || !Array.isArray(state.recoveryCodes)) return false
      const target = sha256(String(code ?? '').trim())
      const remaining = state.recoveryCodes.filter((h) => !hashesEqual(h, target))
      if (remaining.length === state.recoveryCodes.length) return false // nada casou
      await repo.upsert(accountId, { recoveryCodes: remaining })
      return true
    },

    async disableMfa(accountId) {
      // Limpa todo o estado de MFA. Inclui o anti-replay: um futuro re-enroll começa do zero.
      await repo.clear(accountId)
    },
  }
}
