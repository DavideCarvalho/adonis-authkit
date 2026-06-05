import { test } from '@japa/runner'
import { parseImportFile, importUsers } from '../../src/commands/import_users.js'
import type { AccountStore, AuthAccount, ImportAccountInput } from '../../src/accounts/account_store.js'

/** Store fake com import: rastreia chamadas e simula e-mails já existentes. */
function makeStore(existingEmails: string[] = []): {
  store: AccountStore
  imported: ImportAccountInput[]
} {
  const existing = new Set(existingEmails)
  const imported: ImportAccountInput[] = []
  const store = {
    findByEmail: async (email: string): Promise<AuthAccount | null> =>
      existing.has(email) ? { id: 'x', email, globalRoles: [] } : null,
    importAccount: async (input: ImportAccountInput): Promise<AuthAccount | null> => {
      imported.push(input)
      existing.add(input.email)
      return { id: `id-${imported.length}`, email: input.email, globalRoles: input.globalRoles ?? [] }
    },
  } as unknown as AccountStore
  return { store, imported }
}

test.group('parseImportFile', () => {
  test('NDJSON: uma linha JSON por usuário', ({ assert }) => {
    const { records, parseErrors } = parseImportFile(
      '{"email":"a@b.com"}\n{"email":"c@d.com","password_hash":"$2y$x"}\n'
    )
    assert.lengthOf(records, 2)
    assert.lengthOf(parseErrors, 0)
    assert.equal(records[1].record.password_hash, '$2y$x')
  })

  test('NDJSON: linhas vazias ignoradas; linha inválida vira parseError', ({ assert }) => {
    const { records, parseErrors } = parseImportFile('{"email":"a@b.com"}\n\nnot-json\n')
    assert.lengthOf(records, 1)
    assert.lengthOf(parseErrors, 1)
    assert.equal(parseErrors[0].line, 3)
  })

  test('array JSON', ({ assert }) => {
    const { records, parseErrors } = parseImportFile('[{"email":"a@b.com"},{"email":"c@d.com"}]')
    assert.lengthOf(records, 2)
    assert.lengthOf(parseErrors, 0)
  })

  test('array JSON malformado vira parseError', ({ assert }) => {
    const { records, parseErrors } = parseImportFile('[{"email":')
    assert.lengthOf(records, 0)
    assert.lengthOf(parseErrors, 1)
  })
})

test.group('importUsers', () => {
  test('cria contas com e sem password_hash', async ({ assert }) => {
    const { store, imported } = makeStore()
    const report = await importUsers(store, [
      { line: 1, record: { email: 'a@b.com', password_hash: '$2y$abc', name: 'Acme A' } },
      { line: 2, record: { email: 'c@d.com', email_verified: true } },
    ])
    assert.equal(report.created, 2)
    assert.equal(report.skippedDuplicate, 0)
    assert.lengthOf(report.errors, 0)
    assert.equal(imported[0].passwordHash, '$2y$abc')
    assert.isNull(imported[1].passwordHash)
    assert.isTrue(imported[1].emailVerified)
  })

  test('pula e-mails duplicados', async ({ assert }) => {
    const { store, imported } = makeStore(['dup@b.com'])
    const report = await importUsers(store, [
      { line: 1, record: { email: 'dup@b.com', password_hash: 'x' } },
      { line: 2, record: { email: 'new@b.com' } },
    ])
    assert.equal(report.created, 1)
    assert.equal(report.skippedDuplicate, 1)
    assert.lengthOf(imported, 1)
    assert.equal(imported[0].email, 'new@b.com')
  })

  test('registro sem email vira erro', async ({ assert }) => {
    const { store } = makeStore()
    const report = await importUsers(store, [{ line: 1, record: { password_hash: 'x' } }])
    assert.equal(report.created, 0)
    assert.lengthOf(report.errors, 1)
    assert.match(report.errors[0].reason, /email/)
  })

  test('dry-run NÃO persiste mas conta o que seria criado', async ({ assert }) => {
    const { store, imported } = makeStore(['dup@b.com'])
    const report = await importUsers(
      store,
      [
        { line: 1, record: { email: 'new@b.com' } },
        { line: 2, record: { email: 'dup@b.com' } },
      ],
      { dryRun: true }
    )
    assert.equal(report.created, 1)
    assert.equal(report.skippedDuplicate, 1)
    assert.lengthOf(imported, 0) // nada persistido
  })

  test('store sem importAccount → erro por registro', async ({ assert }) => {
    const store = {
      findByEmail: async () => null,
    } as unknown as AccountStore
    const report = await importUsers(store, [{ line: 1, record: { email: 'a@b.com' } }])
    assert.equal(report.created, 0)
    assert.lengthOf(report.errors, 1)
    assert.match(report.errors[0].reason, /import/)
  })
})
