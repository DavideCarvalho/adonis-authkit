import { test } from '@japa/runner'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileKeystoreVault, DriveKeystoreVault, __setKeystoreDriveLoaderForTests } from '../../src/keys/keystore_vault.js'

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

test.group('DriveKeystoreVault', (group) => {
  group.each.teardown(() => __setKeystoreDriveLoaderForTests(undefined))

  test('read/write/head usando um disk fake', async ({ assert }) => {
    const files = new Map<string, string>()
    const fakeDisk = {
      exists: async (k: string) => files.has(k),
      get: async (k: string) => files.get(k)!,
      put: async (k: string, v: string) => void files.set(k, v),
      getMetaData: async () => ({ etag: 'etag-' + files.size }),
    }
    __setKeystoreDriveLoaderForTests(async () => ({ use: () => fakeDisk, ...fakeDisk }))

    const v = new DriveKeystoreVault('keys/jwks.json')
    assert.isNull(await v.read())
    await v.write('blob-1')
    assert.equal(await v.read(), 'blob-1')
    assert.isString(await v.head())
  })

  test('drive ausente + driver selecionado → erro alto', async ({ assert }) => {
    __setKeystoreDriveLoaderForTests(async () => null)
    const v = new DriveKeystoreVault('keys/jwks.json')
    await assert.rejects(() => v.read(), /@adonisjs\/drive não está instalado/)
  })
})
