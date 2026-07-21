import { test } from '@japa/runner';
import { KeystoreCodec } from '../../src/keys/keystore_codec.js';

const STORE = { keys: [{ kid: 'k1', kty: 'RSA', d: 'secret', use: 'sig' }] };

// fake reversível (não-cripto, só p/ teste): base64
const fakeEnc = {
  encrypt: (v: string) => Buffer.from(v, 'utf8').toString('base64'),
  decrypt: <T = string>(v: string) => Buffer.from(v, 'base64').toString('utf8') as unknown as T,
};

test.group('KeystoreCodec (plaintext)', () => {
  test('round-trip plaintext via envelope v2/none', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false });
    const blob = await codec.encode(STORE as any);
    assert.deepEqual(JSON.parse(blob).enc, 'none');
    assert.deepEqual(await codec.decode(blob), STORE);
  });

  test('decode lança em formato irreconhecível', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: false });
    await assert.rejects(() => codec.decode('{"v":2,"enc":"weird","data":"x"}'));
  });
});

test.group('KeystoreCodec (encrypted)', () => {
  test('round-trip encriptado via envelope v2/aes', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: true, enc: fakeEnc });
    const blob = await codec.encode(STORE as any);
    const env = JSON.parse(blob);
    assert.equal(env.enc, 'aes');
    assert.notInclude(env.data, 'secret'); // a privada não aparece em claro
    assert.deepEqual(await codec.decode(blob), STORE);
  });

  test('decrypt que retorna null lança (nunca regenera)', async ({ assert }) => {
    const failing = { encrypt: fakeEnc.encrypt, decrypt: () => null };
    const codec = new KeystoreCodec({ encrypt: true, enc: failing });
    const blob = await new KeystoreCodec({ encrypt: true, enc: fakeEnc }).encode(STORE as any);
    await assert.rejects(() => codec.decode(blob), /decrypt falhou/);
  });

  test('encrypt:true sem serviço lança no encode', async ({ assert }) => {
    const codec = new KeystoreCodec({ encrypt: true });
    await assert.rejects(() => codec.encode(STORE as any), /indisponível/);
  });
});
