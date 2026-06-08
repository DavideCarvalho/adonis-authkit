import { test } from '@japa/runner'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'

test.group('FileKeystoreVault', (group) => {
  let dir: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-vault-')) })
  group.each.teardown(() => rmSync(dir, { recursive: true, force: true }))

  test('read de arquivo ausente → null', async ({ assert }) => {
    const v = new FileKeystoreVault(join(dir, 'nope.json'))
    assert.isNull(await v.read())
  })

  test('write + read round-trip, mode 0600', async ({ assert }) => {
    const path = join(dir, 'jwks.json')
    const v = new FileKeystoreVault(path)
    await v.write('hello-blob')
    assert.equal((await v.read())?.trim(), 'hello-blob')
    assert.equal(statSync(path).mode & 0o777, 0o600)
  })

  test('head muda após write', async ({ assert }) => {
    const path = join(dir, 'jwks.json')
    const v = new FileKeystoreVault(path)
    assert.isNull(await v.head())
    await v.write('x')
    assert.isString(await v.head())
  })
})
