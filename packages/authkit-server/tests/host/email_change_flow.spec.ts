/**
 * Testes do fluxo completo de troca de e-mail verificada:
 * - requestEmailChange: validações, token, e-mail em uso
 * - confirmEmailChange: consome token, retorna oldEmail+newEmail, marca verificado
 * - oldEmail retornado pelo confirmEmailChange (novo campo)
 * - Integração parcial do controller via store stub
 */

import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { createTestDatabase } from '../bootstrap.js'
import { withAuthUser } from '../../src/mixins/with_auth_user.js'
import { withCredentials } from '../../src/mixins/with_credentials.js'
import { lucidAccountStore } from '../../src/accounts/lucid_account_store.js'

class EmailChangeTestAccount extends compose(BaseModel, withAuthUser(), withCredentials()) {
  static table = 'ec_users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true }) declare id: string
  @column() declare fullName: string | null
  @beforeCreate()
  static assignId(row: EmailChangeTestAccount) {
    if (!row.id) row.id = randomUUID()
  }
}

test.group('email_change — store + confirmEmailChange oldEmail', (group) => {
  let db: any
  let store: ReturnType<typeof lucidAccountStore>

  group.setup(async () => {
    db = createTestDatabase()
    BaseModel.useAdapter(db.modelAdapter())
    await db.connection().schema.createTable('ec_users', (t: any) => {
      t.string('id').primary()
      t.string('email').notNullable().unique()
      t.string('password').notNullable()
      t.string('full_name').nullable()
      t.text('global_roles').nullable()
      t.timestamp('email_verified_at').nullable()
      t.string('email_verification_token').nullable()
      t.string('password_reset_token').nullable()
      t.timestamp('password_reset_expires_at').nullable()
      t.timestamps(true)
    })
    store = lucidAccountStore(EmailChangeTestAccount as any)
  })

  group.teardown(async () => {
    await db.manager.closeAll()
  })

  test('confirmEmailChange retorna oldEmail correto', async ({ assert }) => {
    const account = await store.create({ email: 'alice@acme.example.com', password: 'Pass1234!' })

    const issued = await store.requestEmailChange(account.id, 'alice-new@acme.example.com')
    assert.ok(issued)
    assert.equal(issued!.newEmail, 'alice-new@acme.example.com')

    const result = await store.confirmEmailChange(issued!.token)
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.equal(result.oldEmail, 'alice@acme.example.com')
    assert.equal(result.newEmail, 'alice-new@acme.example.com')
    assert.equal(result.account.email, 'alice-new@acme.example.com')
  })

  test('requestEmailChange retorna null para e-mail já em uso por outra conta', async ({ assert }) => {
    await store.create({ email: 'bob@acme.example.com', password: 'Pass1234!' })
    const alice = await store.create({ email: 'alice2@acme.example.com', password: 'Pass1234!' })

    const result = await store.requestEmailChange(alice.id, 'bob@acme.example.com')
    assert.equal(result, null, 'não deve permitir tomar e-mail de outra conta')
  })

  test('requestEmailChange aceita o próprio e-mail (idempotência)', async ({ assert }) => {
    const carol = await store.create({ email: 'carol@acme.example.com', password: 'Pass1234!' })

    // Solicitar com o próprio e-mail é permitido (limpa pending).
    const result = await store.requestEmailChange(carol.id, 'carol@acme.example.com')
    assert.ok(result)
  })

  test('confirmEmailChange retorna ok: false para token inválido', async ({ assert }) => {
    const result = await store.confirmEmailChange('token-invalido')
    assert.equal(result.ok, false)
  })

  test('confirmEmailChange retorna ok: false para token com prefixo errado', async ({ assert }) => {
    const result = await store.confirmEmailChange('ml:sometoken:extra')
    assert.equal(result.ok, false)
  })

  test('segunda confirmação do mesmo token retorna ok: false (single-use)', async ({ assert }) => {
    const dave = await store.create({ email: 'dave@acme.example.com', password: 'Pass1234!' })
    const issued = await store.requestEmailChange(dave.id, 'dave-new@acme.example.com')
    assert.ok(issued)

    const first = await store.confirmEmailChange(issued!.token)
    assert.equal(first.ok, true)

    const second = await store.confirmEmailChange(issued!.token)
    assert.equal(second.ok, false, 'token deve ser single-use')
  })

  test('solicitação sobrescreve pending anterior', async ({ assert }) => {
    const eve = await store.create({ email: 'eve@acme.example.com', password: 'Pass1234!' })

    const first = await store.requestEmailChange(eve.id, 'eve-v1@acme.example.com')
    assert.ok(first)

    const second = await store.requestEmailChange(eve.id, 'eve-v2@acme.example.com')
    assert.ok(second)

    // Token antigo não deve mais funcionar.
    const oldResult = await store.confirmEmailChange(first!.token)
    assert.equal(oldResult.ok, false, 'token antigo deve ser inválido após novo request')

    // Token novo deve funcionar.
    const newResult = await store.confirmEmailChange(second!.token)
    assert.equal(newResult.ok, true)
    if (!newResult.ok) return
    assert.equal(newResult.newEmail, 'eve-v2@acme.example.com')
    assert.equal(newResult.oldEmail, 'eve@acme.example.com')
  })

  test('e-mail verificado após confirmação', async ({ assert }) => {
    const frank = await store.create({ email: 'frank@acme.example.com', password: 'Pass1234!' })

    const issued = await store.requestEmailChange(frank.id, 'frank-new@acme.example.com')
    assert.ok(issued)

    const result = await store.confirmEmailChange(issued!.token)
    assert.equal(result.ok, true)
    if (!result.ok) return

    // A conta deve ter emailVerifiedAt preenchido.
    const updated = await EmailChangeTestAccount.find(frank.id)
    assert.ok(updated?.emailVerifiedAt, 'emailVerifiedAt deve estar preenchido')
    assert.equal(updated?.email, 'frank-new@acme.example.com')
  })

  test('confirmEmailChange retorna ok: false se e-mail foi tomado no meio', async ({ assert }) => {
    const grace = await store.create({ email: 'grace@acme.example.com', password: 'Pass1234!' })

    const issued = await store.requestEmailChange(grace.id, 'grace-new@acme.example.com')
    assert.ok(issued)

    // Outra conta toma o e-mail alvo antes da confirmação.
    await store.create({ email: 'grace-new@acme.example.com', password: 'Pass1234!' })

    const result = await store.confirmEmailChange(issued!.token)
    assert.equal(result.ok, false, 'deve rejeitar quando e-mail foi tomado')
  })

  test('requestEmailChange retorna null para conta inexistente', async ({ assert }) => {
    const result = await store.requestEmailChange('nao-existe', 'qualquer@acme.example.com')
    assert.equal(result, null)
  })
})
