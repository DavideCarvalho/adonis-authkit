import { test } from '@japa/runner';
import {
  __setEncryptionServiceForTests,
  getInjectedEncryptionService,
} from '../../src/keys/keystore_crypto.js';

test.group('keystore crypto', (group) => {
  group.each.teardown(() => __setEncryptionServiceForTests(undefined));

  test('serviço injetado é retornado (sem app)', ({ assert }) => {
    const fake = {
      encrypt: (v: string) => v,
      decrypt: <T = string>(v: string) => v as unknown as T,
    };
    __setEncryptionServiceForTests(fake);
    assert.strictEqual(getInjectedEncryptionService(), fake);
  });

  test('sem injeção, getInjected retorna undefined', ({ assert }) => {
    assert.isUndefined(getInjectedEncryptionService());
  });
});
