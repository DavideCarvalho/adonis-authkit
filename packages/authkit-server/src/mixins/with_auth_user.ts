import { BaseModel, column, beforeSave } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { Scrypt } from '@adonisjs/core/hash/drivers/scrypt'

const hasher = new Scrypt({})

/**
 * Instância composta pelo mixin {@link withAuthUser}.
 */
export interface AuthUserRow {
  email: string
  password: string
  globalRoles: string[]
  verifyPassword(plain: string): Promise<boolean>
}

/**
 * Classe resultante da composição com o mixin {@link withAuthUser}.
 */
export type AuthUserClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): AuthUserRow
}

export function withAuthUser() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model
  ): AuthUserClass<Model> => {
    class AuthUserMixin extends superclass {
      @column()
      declare email: string

      @column({ serializeAs: null })
      declare password: string

      @column({
        prepare: (value: string[] | null) => JSON.stringify(value ?? []),
        consume: (value: string | null) => (value ? JSON.parse(value) : []),
      })
      declare globalRoles: string[]

      @beforeSave()
      static async hashAuthUserPassword(user: AuthUserMixin) {
        if (user.$dirty.password) {
          user.password = await hasher.make(user.password)
        }
      }

      async verifyPassword(plain: string): Promise<boolean> {
        return hasher.verify(this.password, plain)
      }
    }

    return AuthUserMixin as unknown as AuthUserClass<Model>
  }
}
