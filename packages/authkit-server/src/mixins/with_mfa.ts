import { BaseModel } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'

/**
 * @deprecated O estado de MFA deixou de viver no model do host. Estas propriedades
 * NÃO existem mais na linha do model — o tipo é mantido apenas por compatibilidade
 * de assinatura. Use os métodos da {@link MfaCapability} do store (que batem na
 * tabela lib-owned `auth_mfa`).
 */
export interface MfaRow {
  totpSecret: string | null
  mfaEnabledAt: DateTime | null
  recoveryCodes: string[] | null
  lastTotpStep: number | null
  readonly isMfaEnabled: boolean
}

/**
 * @deprecated Veja {@link MfaRow}. O mixin {@link withMfa} virou um no-op de schema.
 */
export type MfaClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model

/**
 * Mixin de MFA/TOTP — AGORA UM NO-OP DE SCHEMA.
 *
 * O estado de MFA (`totp_secret`, `mfa_enabled_at`, `recovery_codes`,
 * `last_totp_step`) é LIB-OWNED: vive na tabela própria auto-gerida `auth_mfa`
 * (criada pelo `ensureAuthkitSchema`), keyed por `account_id`. O host NÃO precisa
 * mais de migration para MFA e o model NÃO carrega mais essas colunas.
 *
 * O export `withMfa` é MANTIDO por compatibilidade — os apps continuam compondo
 * `withMfa()` no model sem precisar mudar nada — mas ele não adiciona mais nenhuma
 * coluna nem comportamento. Toda a leitura/escrita de MFA passa pelos métodos da
 * {@link MfaCapability} do store (`getMfaState`, `verifyTotp`, etc.), que operam
 * sobre `auth_mfa`.
 */
export function withMfa() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(superclass: Model): Model => {
    // No-op: nenhuma coluna/decorator adicionado. Apps que compõem `withMfa()`
    // continuam compilando; o estado de MFA vive em `auth_mfa` (lib-owned).
    return superclass
  }
}
