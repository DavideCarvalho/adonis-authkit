import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'

/**
 * Instância composta pelo mixin {@link withWebauthnCredential}. Representa uma
 * credencial WebAuthn / passkey ligada a uma conta (`accountId`). Uma conta pode
 * ter várias credenciais (vários dispositivos/authenticators).
 *
 * O `id` é o credential id (base64url) devolvido pelo authenticator — é a chave
 * primária. `publicKey` é a chave pública COSE em base64url (texto). `counter` é
 * o contador do signature counter (anti-replay), atualizado a cada autenticação.
 */
export interface WebauthnCredentialRow {
  /** Conta dona desta credencial (→ auth.users). */
  accountId: string
  /** Chave pública COSE em base64url (texto). */
  publicKey: string
  /** Signature counter (anti-replay); atualizado a cada autenticação. */
  counter: number
  /** Transports reportados (ex.: ['internal','hybrid']); null = desconhecido. */
  transports: string[] | null
  /** Rótulo legível opcional (ex.: nome do dispositivo). */
  label: string | null
  createdAt: DateTime
  updatedAt: DateTime
}

export type WebauthnCredentialClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): WebauthnCredentialRow
}

/**
 * Mixin de credenciais WebAuthn / passkey. Adiciona as colunas
 * `account_id`, `public_key`, `counter`, `transports`, `label` + timestamps ao
 * model. Segue o mesmo padrão de {@link withProviderIdentity}: o host compõe um
 * model dedicado (`compose(BaseModel, withWebauthnCredential())`) e passa para o
 * `lucidAccountStore` via a opção `webauthnCredentialModel`.
 */
export function withWebauthnCredential() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model
  ): WebauthnCredentialClass<Model> => {
    class WebauthnCredentialMixin extends superclass {
      @column()
      declare accountId: string

      @column()
      declare publicKey: string

      @column()
      declare counter: number

      @column({
        prepare: (value: string[] | null) => (value && value.length ? JSON.stringify(value) : null),
        consume: (value: string | string[] | null) => {
          if (value === null || value === undefined) return null
          return Array.isArray(value) ? value : JSON.parse(value)
        },
      })
      declare transports: string[] | null

      @column()
      declare label: string | null

      @column.dateTime({ autoCreate: true })
      declare createdAt: DateTime

      @column.dateTime({ autoCreate: true, autoUpdate: true })
      declare updatedAt: DateTime
    }

    return WebauthnCredentialMixin as unknown as WebauthnCredentialClass<Model>
  }
}
