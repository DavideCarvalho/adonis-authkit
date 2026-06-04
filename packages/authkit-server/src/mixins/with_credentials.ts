import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'

/**
 * Instância composta pelo mixin {@link withCredentials}.
 */
export interface CredentialsRow {
  emailVerifiedAt: DateTime | null
  emailVerificationToken: string | null
  passwordResetToken: string | null
  passwordResetExpiresAt: DateTime | null
  readonly isEmailVerified: boolean
}

/**
 * Classe resultante da composição com o mixin {@link withCredentials}.
 */
export type CredentialsClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): CredentialsRow
}

export function withCredentials() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model
  ): CredentialsClass<Model> => {
    class CredentialsMixin extends superclass {
      @column.dateTime()
      declare emailVerifiedAt: DateTime | null

      @column({ serializeAs: null })
      declare emailVerificationToken: string | null

      @column({ serializeAs: null })
      declare passwordResetToken: string | null

      @column.dateTime({ serializeAs: null })
      declare passwordResetExpiresAt: DateTime | null

      get isEmailVerified(): boolean {
        return this.emailVerifiedAt !== null
      }
    }

    return CredentialsMixin as unknown as CredentialsClass<Model>
  }
}
