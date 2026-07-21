import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { createTestDatabase } from '../bootstrap.js'
import { withAuthUser } from '../../src/mixins/with_auth_user.js'
import { lucidAccountStore } from '../../src/accounts/lucid_account_store.js'

/**
 * Regressão do "password nullable": o app vai tornar a coluna `password`
 * nullable (contas passwordless — só magic link/OIDC). `verifyCredentials`
 * precisa devolver `false`/`null` SEM lançar quando o hash é null ou vazio (o
 * scrypt do Adonis pode lançar em hash malformado; o wrapper `passwords.verify`
 * engole via try/catch, mas isto pina o contrato).
 */
class Account extends compose(BaseModel, withAuthUser()) {
  static table = 'users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true })
  declare id: string
  @beforeCreate()
  static assignId(row: Account) {
    if (!row.id) row.id = randomUUID()
  }
}

async function migrate(db: any) {
  BaseModel.useAdapter(db.modelAdapter())
  await db.connection().schema.createTable('users', (t: any) => {
    t.string('id').primary()
    t.string('email').notNullable()
    // NULLABLE de propósito — é o cerne do teste.
    t.string('password').nullable()
    t.text('global_roles').nullable()
    t.timestamp('email_verified_at').nullable()
    t.string('email_verification_token').nullable()
    t.string('password_reset_token').nullable()
    t.timestamp('password_reset_expires_at').nullable()
  })
}

test.group('verifyCredentials com hash null/vazio (password nullable)', (group) => {
  let db: any

  group.each.setup(async () => {
    db = createTestDatabase()
    await migrate(db)
    return async () => {
      await db.manager.closeAll()
    }
  })

  test('hash NULL → retorna null sem lançar', async ({ assert }) => {
    // Insert cru para gravar password NULL (contorna o @beforeSave que hashearia).
    await db
      .connection()
      .table('users')
      .insert({ id: randomUUID(), email: 'null@example.com', password: null, global_roles: '[]' })

    const store = lucidAccountStore(Account, {})
    const result = await store.verifyCredentials('null@example.com', 'qualquer-senha')
    assert.isNull(result)
  })

  test('hash VAZIO ("") → retorna null sem lançar', async ({ assert }) => {
    await db
      .connection()
      .table('users')
      .insert({ id: randomUUID(), email: 'empty@example.com', password: '', global_roles: '[]' })

    const store = lucidAccountStore(Account, {})
    const result = await store.verifyCredentials('empty@example.com', 'qualquer-senha')
    assert.isNull(result)
  })

  test('e-mail inexistente segue retornando null (anti-enumeração, sem lançar)', async ({
    assert,
  }) => {
    const store = lucidAccountStore(Account, {})
    const result = await store.verifyCredentials('naoexiste@example.com', 'x')
    assert.isNull(result)
  })
})
