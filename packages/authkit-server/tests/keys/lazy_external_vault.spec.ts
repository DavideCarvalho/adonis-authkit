import { test } from '@japa/runner';
import { LazyExternalVault } from '../../src/keys/keystore_vault.js';

test.group('LazyExternalVault', () => {
  test('delega ao createKeystoreVault do package (import fake)', async ({ assert }) => {
    const inner = { read: async () => 'blob', write: async () => {}, head: async () => 'v1' };
    const importFn = async (_spec: string) => ({ createKeystoreVault: (_cfg: any) => inner });
    const v = new LazyExternalVault('@fake/pkg', { x: 1 }, importFn);
    assert.equal(await v.read(), 'blob');
    await v.write('b');
    assert.equal(await v.head(), 'v1');
  });

  test('package ausente → erro "instale o package"', async ({ assert }) => {
    const importFn = async (_spec: string) => {
      throw new Error('Cannot find module');
    };
    const v = new LazyExternalVault('@adonis-agora/authkit-vault-aws', {}, importFn);
    await assert.rejects(() => v.read(), /instale o package @adonis-agora\/authkit-vault-aws/);
  });

  test('package sem createKeystoreVault → erro claro', async ({ assert }) => {
    const importFn = async (_spec: string) => ({});
    const v = new LazyExternalVault('@fake/pkg', {}, importFn);
    await assert.rejects(() => v.read(), /createKeystoreVault/);
  });
});
