import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'
import { jsonColumn } from './json_column.js'

/**
 * Instância composta pelo mixin {@link withMfa}.
 *
 * NOTA DE SEGURANÇA: `totpSecret` é o segredo TOTP em claro. No MVP ele é
 * armazenado as-is — encriptar em repouso (ex.: app-key / KMS) é um follow-up.
 */
export interface MfaRow {
  /** Segredo TOTP (base32). null = sem enrollment. Pendente enquanto `mfaEnabledAt` for null. */
  totpSecret: string | null
  /** Setado quando o enrollment é confirmado. null = MFA desligado. */
  mfaEnabledAt: DateTime | null
  /** Hashes (sha256) dos recovery codes; consumidos single-use. */
  recoveryCodes: string[] | null
  /** true quando o MFA está ativo (segredo confirmado). */
  readonly isMfaEnabled: boolean
}

/**
 * Classe resultante da composição com o mixin {@link withMfa}.
 */
export type MfaClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): MfaRow
}

/**
 * Mixin de MFA/TOTP. Adiciona as colunas `totp_secret`, `mfa_enabled_at` e
 * `recovery_codes` ao model de credenciais. Mantido separado de
 * {@link withCredentials} para clareza; componha ambos no model do host.
 */
export function withMfa() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model
  ): MfaClass<Model> => {
    class MfaMixin extends superclass {
      @column({ serializeAs: null })
      declare totpSecret: string | null

      @column.dateTime()
      declare mfaEnabledAt: DateTime | null

      // null quando vazio; consume já lida com valores pré-desserializados (Postgres json/jsonb).
      @column({
        serializeAs: null,
        ...jsonColumn<string[] | null>({ fallback: null }),
      })
      declare recoveryCodes: string[] | null

      get isMfaEnabled(): boolean {
        return this.mfaEnabledAt !== null
      }
    }

    return MfaMixin as unknown as MfaClass<Model>
  }
}
