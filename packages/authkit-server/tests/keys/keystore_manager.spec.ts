import { test } from '@japa/runner'
import { KeystoreManager } from '../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../src/keys/keystore_codec.js'
import type { KeystoreVault } from '../../src/keys/keystore_vault.js'

function memVault(initial: string | null = null): KeystoreVault & { blob: string | null } {
  return {
    blob: initial,
    async read() { return this.blob },
    async write(b: string) { this.blob = b },
    async head() { return this.blob ? String(this.blob.length) : null },
  }
}

test.group('KeystoreManager', () => {
  test('ensure gera + persiste quando ausente', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    const store = await mgr.ensure()
    assert.lengthOf(store.keys, 1)
    assert.isString(store.keys[0].kid)
    assert.isNotNull(vault.blob) // persistiu
  })

  test('ensure existente decodifica e retorna sem reescrever', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const existing = await codec.encode({ keys: [{ kid: 'old', kty: 'RSA', d: 'x', alg: 'RS256' }] } as any)
    const vault = memVault(existing)
    const mgr = new KeystoreManager(vault, codec, 'RS256')
    const store = await mgr.ensure()
    assert.equal(store.keys[0].kid, 'old')          // preserva a chave existente
    assert.equal(vault.blob, existing)              // não reescreveu
  })

  test('rotate gera kid novo na frente e mantém keep', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    await mgr.ensure()
    const firstKid = (await mgr.read())!.keys[0].kid
    const res = await mgr.rotate(2, false)
    assert.notEqual(res.newKid, firstKid)
    const after = (await mgr.read())!
    assert.equal(after.keys[0].kid, res.newKid)      // novo assina
    assert.equal(after.keys[1].kid, firstKid)        // antigo no grace
  })

  test('head delega ao vault', async ({ assert }) => {
    const vault = memVault()
    const mgr = new KeystoreManager(vault, new KeystoreCodec({ encrypt: false }), 'RS256')
    assert.isNull(await mgr.head())
    await mgr.ensure()
    assert.isString(await mgr.head())
  })
})
