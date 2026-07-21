import { test } from '@japa/runner';
import { HashicorpVaultKeystoreVault } from '../../src/keys/keystore_vault.js';

/** Fake KV v2 server (em memória) com a forma de fetch que o vault usa. */
function fakeVault() {
  const store = new Map<string, { value: string; version: number }>();
  const fetchImpl = async (url: string, init?: any) => {
    const method = init?.method ?? 'GET';
    // .../v1/{mount}/data/{path}  (read/write)   |  .../v1/{mount}/metadata/{path} (head)
    const isData = url.includes('/data/');
    const path = url.split(isData ? '/data/' : '/metadata/')[1];
    if (method === 'GET' && isData) {
      const e = store.get(path);
      if (!e) return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: { data: { value: e.value }, metadata: { version: e.version } },
        }),
      };
    }
    if (method === 'POST' && isData) {
      const body = JSON.parse(init.body);
      const prev = store.get(path);
      const version = (prev?.version ?? 0) + 1;
      store.set(path, { value: body.data.value, version });
      return { ok: true, status: 200, json: async () => ({ data: { version } }) };
    }
    if (method === 'GET' && !isData) {
      const e = store.get(path);
      if (!e) return { ok: false, status: 404, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { current_version: e.version } }),
      };
    }
    return { ok: false, status: 400, json: async () => ({}) };
  };
  return fetchImpl as any;
}

test.group('HashicorpVaultKeystoreVault', () => {
  test('read ausente → null; round-trip; head reflete versão', async ({ assert }) => {
    const v = new HashicorpVaultKeystoreVault(
      { endpoint: 'http://vault:8200', path: 'authkit/jwks', token: 't' },
      fakeVault(),
    );
    assert.isNull(await v.read());
    await v.write('blob-1');
    assert.equal(await v.read(), 'blob-1');
    const h1 = await v.head();
    assert.isString(h1);
    await v.write('blob-2');
    assert.equal(await v.read(), 'blob-2');
    assert.notEqual(await v.head(), h1); // versão mudou
  });

  test('erro HTTP não-404 no read → lança (chave crítica)', async ({ assert }) => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const v = new HashicorpVaultKeystoreVault(
      { endpoint: 'http://vault:8200', path: 'p', token: 't' },
      fetchImpl as any,
    );
    await assert.rejects(() => v.read());
  });
});
