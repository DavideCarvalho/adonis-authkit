import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { authenticator } from 'otplib'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, beforeCreate } from '@adonisjs/lucid/orm'
import { createTestDatabase } from '../bootstrap.js'
import { withAuthUser } from '../../src/mixins/with_auth_user.js'
import { withCredentials } from '../../src/mixins/with_credentials.js'
import { withMfa } from '../../src/mixins/with_mfa.js'
import { withProviderIdentity } from '../../src/mixins/with_provider_identity.js'
import { withWebauthnCredential } from '../../src/mixins/with_webauthn_credential.js'
import { lucidAccountStore } from '../../src/accounts/lucid_account_store.js'
import type { WebauthnCeremonies } from '../../src/accounts/lucid_account_store.js'
import {
  supportsPasskeys,
  supportsProviderIdentity,
} from '../../src/accounts/account_store.js'

class TestAccount extends compose(BaseModel, withAuthUser(), withCredentials(), withMfa()) {
  static table = 'users'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true })
  declare id: string
  @column()
  declare fullName: string | null
  @beforeCreate()
  static assignId(row: TestAccount) {
    if (!row.id) row.id = randomUUID()
  }
}

class TestProviderIdentity extends compose(BaseModel, withProviderIdentity()) {
  static table = 'provider_identities'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true })
  declare id: string
  @beforeCreate()
  static assignId(row: TestProviderIdentity) {
    if (!row.id) row.id = randomUUID()
  }
}

class TestWebauthnCredential extends compose(BaseModel, withWebauthnCredential()) {
  static table = 'webauthn_credentials'
  static selfAssignPrimaryKey = true
  @column({ isPrimary: true })
  declare id: string
}

/**
 * Cerimônias WebAuthn mockadas: permitem testar registro/autenticação SEM um
 * authenticator real. `generate*` devolvem um challenge fixo + um id "fake";
 * `verify*` aceitam quando a resposta carrega `__valid: true`.
 */
function fakeCeremonies(credentialId = 'cred-1'): WebauthnCeremonies {
  return {
    generateRegistrationOptions: (async () => ({
      challenge: 'reg-challenge',
      rp: { name: 'Test', id: 'localhost' },
    })) as any,
    verifyRegistrationResponse: (async ({ response }: any) => {
      if (!response?.__valid) return { verified: false }
      return {
        verified: true,
        registrationInfo: {
          credential: {
            id: credentialId,
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 0,
            transports: ['internal'],
          },
        },
      }
    }) as any,
    generateAuthenticationOptions: (async () => ({
      challenge: 'auth-challenge',
      rpId: 'localhost',
    })) as any,
    verifyAuthenticationResponse: (async ({ response }: any) => {
      if (!response?.__valid) return { verified: false, authenticationInfo: { newCounter: 0 } }
      return { verified: true, authenticationInfo: { newCounter: 5 } }
    }) as any,
  }
}

test.group('lucidAccountStore', (group) => {
  let db: any
  group.each.setup(async () => {
    db = createTestDatabase()
    BaseModel.useAdapter(db.modelAdapter())
    await db.connection().schema.createTable('users', (t: any) => {
      t.string('id').primary()
      t.string('email').notNullable()
      t.string('password').notNullable()
      t.string('full_name').nullable()
      t.text('global_roles').nullable()
      t.timestamp('email_verified_at').nullable()
      t.string('email_verification_token').nullable()
      t.string('password_reset_token').nullable()
      t.timestamp('password_reset_expires_at').nullable()
      t.string('totp_secret').nullable()
      t.timestamp('mfa_enabled_at').nullable()
      t.text('recovery_codes').nullable()
    })
    await db.connection().schema.createTable('provider_identities', (t: any) => {
      t.string('id').primary()
      t.string('provider').notNullable()
      t.string('provider_user_id').notNullable()
      t.string('account_id').notNullable()
      t.string('email').nullable()
      t.timestamp('created_at').nullable()
      t.timestamp('updated_at').nullable()
      t.unique(['provider', 'provider_user_id'])
    })
    await db.connection().schema.createTable('webauthn_credentials', (t: any) => {
      t.string('id').primary()
      t.string('account_id').notNullable()
      t.text('public_key').notNullable()
      t.integer('counter').notNullable().defaultTo(0)
      t.text('transports').nullable()
      t.string('label').nullable()
      t.timestamp('created_at').nullable()
      t.timestamp('updated_at').nullable()
    })
    return async () => db.manager.closeAll()
  })

  test('create hasheia a senha e mapeia AuthAccount', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({
      email: 'a@b.com',
      password: 'secret123',
      fullName: 'Alice',
      globalRoles: ['ADMIN'],
    })
    assert.equal(acc.email, 'a@b.com')
    assert.equal(acc.name, 'Alice')
    assert.deepEqual(acc.globalRoles, ['ADMIN'])
    const row = await TestAccount.findBy('email', 'a@b.com')
    assert.notEqual(row!.password, 'secret123') // hash
  })

  test('findById e findByEmail retornam AuthAccount ou null', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const created = await store.create({ email: 'c@d.com', password: 'pw12345678' })
    assert.equal((await store.findById(created.id))!.email, 'c@d.com')
    assert.equal((await store.findByEmail('c@d.com'))!.id, created.id)
    assert.isNull(await store.findById('nope'))
    assert.isNull(await store.findByEmail('nobody@x.com'))
  })

  test('verifyCredentials confere a senha', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'e@f.com', password: 'rightpass1' })
    assert.equal((await store.verifyCredentials('e@f.com', 'rightpass1'))!.email, 'e@f.com')
    assert.isNull(await store.verifyCredentials('e@f.com', 'wrongpass'))
    assert.isNull(await store.verifyCredentials('ghost@f.com', 'rightpass1'))
  })

  test('reset de senha: issue → consume válido troca a senha; reuso falha', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'g@h.com', password: 'oldpass123' })
    const issued = await store.issuePasswordResetToken('g@h.com')
    assert.isNotNull(issued)
    assert.equal(issued!.account.email, 'g@h.com')

    const ok = await store.consumePasswordResetToken(issued!.token, 'newpass123')
    assert.isTrue(ok)
    assert.isNotNull(await store.verifyCredentials('g@h.com', 'newpass123'))
    // token foi limpo → reuso falha
    assert.isFalse(await store.consumePasswordResetToken(issued!.token, 'another123'))
  })

  test('issuePasswordResetToken retorna null pra email inexistente', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    assert.isNull(await store.issuePasswordResetToken('void@x.com'))
  })

  test('consumePasswordResetToken falha se expirado', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'i@j.com', password: 'oldpass123' })
    const issued = await store.issuePasswordResetToken('i@j.com')
    // força expiração no passado
    const row = await TestAccount.findBy('email', 'i@j.com')
    row!.passwordResetExpiresAt = DateTime.now().minus({ hours: 2 })
    await row!.save()
    assert.isFalse(await store.consumePasswordResetToken(issued!.token, 'newpass123'))
  })

  test('verificação de e-mail: issue → consume válido marca verificado; reuso falha', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'k@l.com', password: 'pass123456' })
    const issued = await store.issueEmailVerificationToken('k@l.com')
    assert.isNotNull(issued)
    assert.equal(issued!.account.email, 'k@l.com')

    const ok = await store.consumeEmailVerificationToken(issued!.token)
    assert.isTrue(ok)
    const row = await TestAccount.findBy('email', 'k@l.com')
    assert.isTrue(row!.isEmailVerified)
    assert.isNull(row!.emailVerificationToken)
    // token foi limpo → reuso falha
    assert.isFalse(await store.consumeEmailVerificationToken(issued!.token))
  })

  test('issueEmailVerificationToken retorna null pra email inexistente', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    assert.isNull(await store.issueEmailVerificationToken('void@x.com'))
  })

  test('consumeEmailVerificationToken falha pra token inválido ou vazio', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'm@n.com', password: 'pass123456' })
    assert.isFalse(await store.consumeEmailVerificationToken('nope'))
    assert.isFalse(await store.consumeEmailVerificationToken(''))
  })

  // ----- Self-service de segurança (senha / e-mail) -----

  test('changePassword: senha errada falha em verifyCredentials; nova passa', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'sec1@x.com', password: 'oldpass123' })
    // Senha atual errada não autentica.
    assert.isNull(await store.verifyCredentials('sec1@x.com', 'wrongpass'))
    // Troca de senha e verifica que a nova passa e a antiga não.
    assert.isTrue(await store.changePassword!(acc.id, 'newpass123'))
    assert.isNotNull(await store.verifyCredentials('sec1@x.com', 'newpass123'))
    assert.isNull(await store.verifyCredentials('sec1@x.com', 'oldpass123'))
  })

  test('changePassword retorna false para conta inexistente', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    assert.isFalse(await store.changePassword!('nope', 'whatever123'))
  })

  test('troca de e-mail: request → confirm aplica o novo e-mail (roundtrip)', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'old@x.com', password: 'pass123456' })
    const issued = await store.requestEmailChange!(acc.id, 'new@x.com')
    assert.isNotNull(issued)
    assert.equal(issued!.newEmail, 'new@x.com')
    // O e-mail ainda NÃO mudou antes de confirmar.
    assert.equal((await store.findById(acc.id))!.email, 'old@x.com')

    const confirmed = await store.confirmEmailChange!(issued!.token)
    assert.isTrue(confirmed.ok)
    if (confirmed.ok) assert.equal(confirmed.newEmail, 'new@x.com')
    assert.equal((await store.findById(acc.id))!.email, 'new@x.com')
    const row = await TestAccount.find(acc.id)
    assert.isTrue(row!.isEmailVerified)
    // Token consumido → reuso falha.
    assert.isFalse((await store.confirmEmailChange!(issued!.token)).ok)
  })

  test('confirmEmailChange falha com token bogus / verificação normal não consome ec:', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'sec2@x.com', password: 'pass123456' })
    assert.isFalse((await store.confirmEmailChange!('bogus')).ok)
    assert.isFalse((await store.confirmEmailChange!('ec:bad')).ok)

    // Um token de troca de e-mail NÃO pode ser consumido como verificação de cadastro.
    const issued = await store.requestEmailChange!(acc.id, 'sec2new@x.com')
    assert.isFalse(await store.consumeEmailVerificationToken(issued!.token))
  })

  test('requestEmailChange retorna null quando o novo e-mail já pertence a outra conta', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'taken@x.com', password: 'pass123456' })
    const acc = await store.create({ email: 'me@x.com', password: 'pass123456' })
    assert.isNull(await store.requestEmailChange!(acc.id, 'taken@x.com'))
  })

  // ----- MFA / TOTP -----

  test('startTotpEnrollment retorna secret + otpauthUri e deixa o MFA pendente', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount, { mfaIssuer: 'MyApp' })
    const acc = await store.create({ email: 'mfa1@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    assert.isNotNull(started)
    assert.isString(started!.secret)
    assert.match(started!.otpauthUri, /^otpauth:\/\/totp\//)
    assert.include(decodeURIComponent(started!.otpauthUri), 'MyApp')
    // ainda pendente → getMfaState desligado
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)
  })

  test('startTotpEnrollment retorna null pra conta inexistente', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    assert.isNull(await store.startTotpEnrollment!('nope'))
  })

  test('confirmTotpEnrollment com código válido ativa o MFA e gera recovery codes', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa2@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    const code = authenticator.generate(started!.secret)

    const result = await store.confirmTotpEnrollment!(acc.id, code)
    assert.isTrue(result.ok)
    assert.lengthOf(result.recoveryCodes!, 8)
    assert.isTrue((await store.getMfaState!(acc.id)).enabled)

    const row = await TestAccount.findBy('email', 'mfa2@x.com')
    assert.isNotNull(row!.mfaEnabledAt)
    // armazenados como hashes, não plaintext
    assert.notInclude(row!.recoveryCodes ?? [], result.recoveryCodes![0])
    assert.lengthOf(row!.recoveryCodes ?? [], 8)
  })

  test('confirmTotpEnrollment com código inválido não ativa', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa3@x.com', password: 'pass123456' })
    await store.startTotpEnrollment!(acc.id)
    const result = await store.confirmTotpEnrollment!(acc.id, '000000')
    assert.isFalse(result.ok)
    assert.isUndefined(result.recoveryCodes)
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)
  })

  test('verifyTotp confere o código contra o segredo ativo', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa4@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    await store.confirmTotpEnrollment!(acc.id, authenticator.generate(started!.secret))

    assert.isTrue(await store.verifyTotp!(acc.id, authenticator.generate(started!.secret)))
    assert.isFalse(await store.verifyTotp!(acc.id, '000000'))
  })

  test('verifyTotp é false quando o MFA não está ativo (segredo pendente)', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa5@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    // pendente, não confirmado
    assert.isFalse(await store.verifyTotp!(acc.id, authenticator.generate(started!.secret)))
  })

  test('consumeRecoveryCode é single-use', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa6@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    const { recoveryCodes } = await store.confirmTotpEnrollment!(
      acc.id,
      authenticator.generate(started!.secret)
    )
    const code = recoveryCodes![0]

    assert.isTrue(await store.consumeRecoveryCode!(acc.id, code))
    // segunda vez falha (consumido)
    assert.isFalse(await store.consumeRecoveryCode!(acc.id, code))
    // código inexistente falha
    assert.isFalse(await store.consumeRecoveryCode!(acc.id, 'zzzzz-zzzzz'))
  })

  test('disableMfa limpa segredo + mfaEnabledAt + recovery codes', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa7@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    await store.confirmTotpEnrollment!(acc.id, authenticator.generate(started!.secret))
    assert.isTrue((await store.getMfaState!(acc.id)).enabled)

    await store.disableMfa!(acc.id)
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)
    const row = await TestAccount.findBy('email', 'mfa7@x.com')
    assert.isNull(row!.totpSecret)
    assert.isNull(row!.mfaEnabledAt)
    assert.isNull(row!.recoveryCodes)
  })

  test('com encrypter: segredo TOTP é encriptado em repouso e verifyTotp continua válido', async ({
    assert,
  }) => {
    // Encrypter stub: round-trip base64 (não é o raw secret no banco).
    const encrypter = {
      encrypt: (v: string) => Buffer.from(v, 'utf8').toString('base64'),
      decrypt: (v: string) => {
        try {
          return Buffer.from(v, 'base64').toString('utf8')
        } catch {
          return null
        }
      },
    }
    const store = lucidAccountStore(TestAccount, { encrypter })
    const acc = await store.create({ email: 'enc1@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)

    // O valor persistido NÃO é o segredo raw — está encriptado.
    const row = await TestAccount.findBy('email', 'enc1@x.com')
    assert.notEqual(row!.totpSecret, started!.secret)
    assert.equal(encrypter.decrypt(row!.totpSecret as string), started!.secret)

    // Confirma + verifica usando códigos gerados a partir do segredo raw.
    const confirmed = await store.confirmTotpEnrollment!(
      acc.id,
      authenticator.generate(started!.secret)
    )
    assert.isTrue(confirmed.ok)
    assert.isTrue(await store.verifyTotp!(acc.id, authenticator.generate(started!.secret)))
    assert.isFalse(await store.verifyTotp!(acc.id, '000000'))
  })

  test('com encrypter: segredo adulterado (decrypt → null) invalida verifyTotp/confirm', async ({
    assert,
  }) => {
    // decrypt sempre falha → trata como "sem segredo".
    const encrypter = {
      encrypt: (v: string) => Buffer.from(v, 'utf8').toString('base64'),
      decrypt: (_v: string) => null,
    }
    const store = lucidAccountStore(TestAccount, { encrypter })
    const acc = await store.create({ email: 'enc2@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    // confirm falha porque o segredo "não abre"
    const confirmed = await store.confirmTotpEnrollment!(
      acc.id,
      authenticator.generate(started!.secret)
    )
    assert.isFalse(confirmed.ok)
  })

  test('sem encrypter: segredo TOTP fica em claro (comportamento legado)', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'enc3@x.com', password: 'pass123456' })
    const started = await store.startTotpEnrollment!(acc.id)
    const row = await TestAccount.findBy('email', 'enc3@x.com')
    assert.equal(row!.totpSecret, started!.secret)
  })

  test('getMfaState reflete habilitado/desabilitado', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'mfa8@x.com', password: 'pass123456' })
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)
    const started = await store.startTotpEnrollment!(acc.id)
    await store.confirmTotpEnrollment!(acc.id, authenticator.generate(started!.secret))
    assert.isTrue((await store.getMfaState!(acc.id)).enabled)
  })

  // ----- Account linking por provider identity -----

  test('linkProviderIdentity → findByProviderIdentity retorna a conta', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount, {
      providerIdentityModel: TestProviderIdentity,
    })
    const acc = await store.create({ email: 'link1@x.com', password: 'pass123456' })
    await store.linkProviderIdentity({
      accountId: acc.id,
      provider: 'google',
      providerUserId: 'g-123',
      email: 'link1@x.com',
    })
    const found = await store.findByProviderIdentity('google', 'g-123')
    assert.isNotNull(found)
    assert.equal(found!.id, acc.id)
    assert.equal(found!.email, 'link1@x.com')
  })

  test('linkProviderIdentity é idempotente: não duplica e atualiza o email', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount, {
      providerIdentityModel: TestProviderIdentity,
    })
    const acc = await store.create({ email: 'link2@x.com', password: 'pass123456' })
    await store.linkProviderIdentity({
      accountId: acc.id,
      provider: 'google',
      providerUserId: 'g-dup',
      email: 'old@x.com',
    })
    await store.linkProviderIdentity({
      accountId: acc.id,
      provider: 'google',
      providerUserId: 'g-dup',
      email: 'new@x.com',
    })
    const rows = await TestProviderIdentity.query()
      .where('provider', 'google')
      .where('providerUserId', 'g-dup')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].email, 'new@x.com')
    assert.equal((await store.findByProviderIdentity('google', 'g-dup'))!.id, acc.id)
  })

  test('findByProviderIdentity retorna null pra identidade desconhecida', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount, {
      providerIdentityModel: TestProviderIdentity,
    })
    assert.isNull(await store.findByProviderIdentity('github', 'unknown'))
  })

  test('dois providers diferentes podem ligar à mesma conta', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount, {
      providerIdentityModel: TestProviderIdentity,
    })
    const acc = await store.create({ email: 'link3@x.com', password: 'pass123456' })
    await store.linkProviderIdentity({ accountId: acc.id, provider: 'google', providerUserId: 'gg-1' })
    await store.linkProviderIdentity({ accountId: acc.id, provider: 'github', providerUserId: 'gh-1' })
    assert.equal((await store.findByProviderIdentity('google', 'gg-1'))!.id, acc.id)
    assert.equal((await store.findByProviderIdentity('github', 'gh-1'))!.id, acc.id)
  })

  test('capacidade de provider-identity AUSENTE sem providerIdentityModel', async ({
    assert,
  }) => {
    // Sem o model, a capacidade inteira não é montada: os métodos não existem
    // (em vez de presentes-mas-lançando).
    const store = lucidAccountStore(TestAccount)
    assert.isFalse('findByProviderIdentity' in store)
    assert.isFalse('linkProviderIdentity' in store)
    assert.isFalse(supportsProviderIdentity(store))
  })

  test('capacidade de provider-identity PRESENTE com providerIdentityModel', async ({
    assert,
  }) => {
    const store = lucidAccountStore(TestAccount, { providerIdentityModel: TestProviderIdentity })
    assert.isTrue('findByProviderIdentity' in store)
    assert.isTrue('linkProviderIdentity' in store)
    assert.isTrue(supportsProviderIdentity(store))
  })

  // ----- Administração (console admin — B6) -----

  test('listAccounts retorna dados paginados + total', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    for (let i = 0; i < 5; i++) {
      await store.create({ email: `list-${i}@x.com`, password: 'pass123456' })
    }
    const firstPage = await store.listAccounts({ page: 1, limit: 2 })
    assert.equal(firstPage.total, 5)
    assert.lengthOf(firstPage.data, 2)

    const secondPage = await store.listAccounts({ page: 2, limit: 2 })
    assert.lengthOf(secondPage.data, 2)
    // Páginas distintas não repetem (ordenado por email).
    assert.notEqual(firstPage.data[0].id, secondPage.data[0].id)

    const thirdPage = await store.listAccounts({ page: 3, limit: 2 })
    assert.lengthOf(thirdPage.data, 1)
  })

  test('listAccounts filtra por email (substring)', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await store.create({ email: 'alice@example.com', password: 'pass123456' })
    await store.create({ email: 'bob@example.com', password: 'pass123456' })
    await store.create({ email: 'carol@other.com', password: 'pass123456' })

    const example = await store.listAccounts({ search: 'example.com' })
    assert.equal(example.total, 2)

    const bob = await store.listAccounts({ search: 'bob' })
    assert.equal(bob.total, 1)
    assert.equal(bob.data[0].email, 'bob@example.com')

    const none = await store.listAccounts({ search: 'nobody' })
    assert.equal(none.total, 0)
    assert.lengthOf(none.data, 0)
  })

  test('setGlobalRoles persiste as roles globais', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    const acc = await store.create({ email: 'roles@x.com', password: 'pass123456', globalRoles: [] })
    await store.setGlobalRoles(acc.id, ['ADMIN', 'EDITOR'])

    const reloaded = await store.findById(acc.id)
    assert.deepEqual(reloaded!.globalRoles, ['ADMIN', 'EDITOR'])

    // Substitui (não acumula).
    await store.setGlobalRoles(acc.id, ['VIEWER'])
    assert.deepEqual((await store.findById(acc.id))!.globalRoles, ['VIEWER'])
  })

  test('setGlobalRoles em conta inexistente é no-op', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    await assert.doesNotReject(() => store.setGlobalRoles('nope', ['ADMIN']))
  })

  // ----- MFA / WebAuthn (passkeys) -----

  const webauthnStore = () =>
    lucidAccountStore(TestAccount, {
      webauthnCredentialModel: TestWebauthnCredential,
      webauthn: { rpName: 'Test', rpId: 'localhost', origin: 'http://localhost' },
      webauthnCeremonies: fakeCeremonies(),
    })

  test('generatePasskeyRegistrationOptions devolve options + challenge; null pra conta inexistente', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk1@x.com', password: 'pass123456' })
    const gen = await store.generatePasskeyRegistrationOptions!(acc.id)
    assert.isNotNull(gen)
    assert.equal(gen!.challenge, 'reg-challenge')
    assert.isObject(gen!.options)
    assert.isNull(await store.generatePasskeyRegistrationOptions!('nope'))
  })

  test('verifyPasskeyRegistration: resposta válida persiste credencial e habilita MFA', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk2@x.com', password: 'pass123456' })
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)

    const ok = await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')
    assert.isTrue(ok)
    // MFA habilitado e credencial persistida.
    assert.isTrue((await store.getMfaState!(acc.id)).enabled)
    const list = await store.listPasskeys!(acc.id)
    assert.lengthOf(list, 1)
    assert.equal(list[0].id, 'cred-1')

    const row = await TestWebauthnCredential.find('cred-1')
    assert.equal(row!.accountId, acc.id)
    // publicKey armazenado como base64url (Uint8Array [1,2,3,4]).
    assert.equal(row!.publicKey, Buffer.from([1, 2, 3, 4]).toString('base64url'))
    assert.deepEqual(row!.transports, ['internal'])
  })

  test('verifyPasskeyRegistration: resposta inválida não persiste nada', async ({ assert }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk3@x.com', password: 'pass123456' })
    const ok = await store.verifyPasskeyRegistration!(acc.id, { __valid: false }, 'reg-challenge')
    assert.isFalse(ok)
    assert.lengthOf(await store.listPasskeys!(acc.id), 0)
    assert.isFalse((await store.getMfaState!(acc.id)).enabled)
  })

  test('listPasskeys / removePasskey funcionam por conta', async ({ assert }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk4@x.com', password: 'pass123456' })
    await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')
    assert.lengthOf(await store.listPasskeys!(acc.id), 1)

    await store.removePasskey!(acc.id, 'cred-1')
    assert.lengthOf(await store.listPasskeys!(acc.id), 0)
  })

  test('generatePasskeyAuthenticationOptions: null sem credenciais, options + challenge com', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk5@x.com', password: 'pass123456' })
    assert.isNull(await store.generatePasskeyAuthenticationOptions!(acc.id))

    await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')
    const gen = await store.generatePasskeyAuthenticationOptions!(acc.id)
    assert.isNotNull(gen)
    assert.equal(gen!.challenge, 'auth-challenge')
  })

  test('verifyPasskeyAuthentication: resposta válida atualiza o counter e retorna true', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk6@x.com', password: 'pass123456' })
    await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')

    const ok = await store.verifyPasskeyAuthentication!(
      acc.id,
      { id: 'cred-1', __valid: true },
      'auth-challenge'
    )
    assert.isTrue(ok)
    // counter atualizado pelo newCounter mockado (5).
    const row = await TestWebauthnCredential.find('cred-1')
    assert.equal(row!.counter, 5)
  })

  test('verifyPasskeyAuthentication: resposta inválida retorna false e não muda o counter', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk7@x.com', password: 'pass123456' })
    await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')

    const ok = await store.verifyPasskeyAuthentication!(
      acc.id,
      { id: 'cred-1', __valid: false },
      'auth-challenge'
    )
    assert.isFalse(ok)
    const row = await TestWebauthnCredential.find('cred-1')
    assert.equal(row!.counter, 0)
  })

  test('verifyPasskeyAuthentication: credential id desconhecido retorna false', async ({
    assert,
  }) => {
    const store = webauthnStore()
    const acc = await store.create({ email: 'pk8@x.com', password: 'pass123456' })
    await store.verifyPasskeyRegistration!(acc.id, { __valid: true }, 'reg-challenge')
    const ok = await store.verifyPasskeyAuthentication!(
      acc.id,
      { id: 'unknown', __valid: true },
      'auth-challenge'
    )
    assert.isFalse(ok)
  })

  test('capacidade de passkey AUSENTE sem webauthnCredentialModel', async ({ assert }) => {
    // Sem o model, a capacidade WebAuthn inteira não é montada: os métodos não
    // existem no store (em vez de presentes-mas-lançando).
    const store = lucidAccountStore(TestAccount)
    assert.isFalse('generatePasskeyRegistrationOptions' in store)
    assert.isFalse('verifyPasskeyRegistration' in store)
    assert.isFalse('generatePasskeyAuthenticationOptions' in store)
    assert.isFalse('verifyPasskeyAuthentication' in store)
    assert.isFalse('listPasskeys' in store)
    assert.isFalse('removePasskey' in store)
    assert.isFalse(supportsPasskeys(store))
  })

  test('capacidade de passkey PRESENTE com webauthnCredentialModel', async ({ assert }) => {
    const store = webauthnStore()
    assert.isTrue('generatePasskeyRegistrationOptions' in store)
    assert.isTrue('listPasskeys' in store)
    assert.isTrue(supportsPasskeys(store))
  })

  // MFA é capacidade SEMPRE presente (não depende de model opcional).
  test('capacidade de MFA sempre presente', async ({ assert }) => {
    const store = lucidAccountStore(TestAccount)
    assert.isTrue('getMfaState' in store)
    assert.isTrue('verifyTotp' in store)
  })
})
