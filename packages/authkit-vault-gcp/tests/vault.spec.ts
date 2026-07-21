import { test } from '@japa/runner';
import { createKeystoreVault } from '../index.js';

test.group('gcp keystore vault', () => {
  test('round-trip via SecretBackend injetável', async ({ assert }) => {
    let v: string | null = null;
    let ver = 0;
    const vault = createKeystoreVault({
      name: 'projects/p/secrets/authkit-jwks',
      backend: {
        get: async () => v,
        put: async (b: string) => {
          v = b;
          ver++;
        },
        version: async () => (v === null ? null : String(ver)),
      },
    } as any);
    assert.isNull(await vault.read());
    await vault.write('blob-1');
    assert.equal(await vault.read(), 'blob-1');
    assert.isString(await vault.head!());
    await vault.write('blob-2');
    assert.equal(await vault.read(), 'blob-2');
  });
});
