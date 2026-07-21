import { test } from '@japa/runner';
import { KeystoreReloadPoller } from '../../src/provider/keystore_reload.js';

test.group('KeystoreReloadPoller', () => {
  test('chama reload quando o head muda', async ({ assert }) => {
    let head = 'h1';
    let reloads = 0;
    const poller = new KeystoreReloadPoller({
      head: async () => head,
      reload: async () => {
        reloads++;
      },
      intervalMs: 10,
    });
    await poller.tick(); // baseline (h1), sem reload
    assert.equal(reloads, 0);
    head = 'h2';
    await poller.tick(); // mudou → reload
    assert.equal(reloads, 1);
    await poller.tick(); // não mudou → sem reload
    assert.equal(reloads, 1);
  });

  test('erro no head/reload não propaga (fail-safe)', async ({ assert }) => {
    let errors = 0;
    const poller = new KeystoreReloadPoller({
      head: async () => {
        throw new Error('boom');
      },
      reload: async () => {},
      intervalMs: 10,
      onError: () => {
        errors++;
      },
    });
    await poller.tick(); // não lança
    assert.equal(errors, 1);
  });
});
