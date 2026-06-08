import { test } from '@japa/runner'
import { KeystoreCodec, isLegacyBlob } from '../../src/keys/keystore_codec.js'

const STORE = { keys: [{ kid: 'k1', kty: 'RSA', d: 'secret', use: 'sig' }] }

test.group('KeystoreCodec (plaintext)', () => {
  test('round-trip plaintext via envelope v2/none', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const blob = await codec.encode(STORE as any)
    assert.deepEqual(JSON.parse(blob).enc, 'none')
    assert.deepEqual(await codec.decode(blob), STORE)
  })

  test('decode lê keystore legado (JSON cru sem envelope)', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    const legacy = JSON.stringify(STORE)
    assert.isTrue(isLegacyBlob(legacy))
    assert.deepEqual(await codec.decode(legacy), STORE)
  })

  test('decode lança em formato irreconhecível', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false })
    await assert.rejects(() => codec.decode('{"v":2,"enc":"weird","data":"x"}'))
  })
})
