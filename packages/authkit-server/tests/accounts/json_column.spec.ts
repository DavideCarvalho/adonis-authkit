import { test } from '@japa/runner';
import { jsonColumn } from '../../src/mixins/json_column.js';

/**
 * Cobre as variações de serialização JSON usadas pelos mixins, garantindo que o
 * helper canônico preserva o comportamento exato de cada coluna.
 */
test.group('jsonColumn', () => {
  test('globalRoles: sempre serializa (vazio → "[]"), leitura cai em []', ({ assert }) => {
    const col = jsonColumn<string[]>({ fallback: [], emptyOnWrite: 'serialize' });
    assert.equal(col.prepare(['ADMIN']), '["ADMIN"]');
    assert.equal(col.prepare([]), '[]'); // array vazio é serializado
    assert.equal(col.prepare(null), '[]'); // null serializa o fallback
    assert.equal(col.prepare(undefined), '[]');
    assert.deepEqual(col.consume('["ADMIN"]'), ['ADMIN']);
    assert.deepEqual(col.consume(null), []); // fallback
    assert.deepEqual(col.consume(undefined), []);
  });

  test('scopes: null quando vazio na escrita, leitura cai em []', ({ assert }) => {
    const col = jsonColumn<string[]>({ fallback: [] });
    assert.equal(col.prepare(['read']), '["read"]');
    assert.equal(col.prepare([]), '[]'); // [] é truthy → serializa (não vazio)
    assert.isNull(col.prepare(null));
    assert.isNull(col.prepare(undefined));
    assert.deepEqual(col.consume('["read"]'), ['read']);
    assert.deepEqual(col.consume(null), []);
  });

  test('recoveryCodes: null quando vazio, consume aceita array já desserializado', ({ assert }) => {
    const col = jsonColumn<string[] | null>({ fallback: null });
    assert.equal(col.prepare(['h1', 'h2']), '["h1","h2"]');
    assert.equal(col.prepare([]), '[]'); // [] truthy → serializa
    assert.isNull(col.prepare(null));
    assert.deepEqual(col.consume('["h1"]'), ['h1']);
    assert.deepEqual(col.consume(['h1']), ['h1']); // consume lida com valores pré-desserializados
    assert.isNull(col.consume(null));
    assert.isNull(col.consume(undefined));
  });

  test('transports: array vazio também grava null; consume lida com array já desserializado', ({
    assert,
  }) => {
    const col = jsonColumn<string[] | null>({
      fallback: null,
      treatEmptyArrayAsEmpty: true,
    });
    assert.equal(col.prepare(['internal']), '["internal"]');
    assert.isNull(col.prepare([])); // array vazio → null
    assert.isNull(col.prepare(null));
    assert.deepEqual(col.consume('["internal"]'), ['internal']);
    assert.deepEqual(col.consume(['internal']), ['internal']);
    assert.isNull(col.consume(null));
  });

  test('metadata: objeto serializado quando presente, null quando ausente', ({ assert }) => {
    const col = jsonColumn<Record<string, unknown> | null>({ fallback: null });
    assert.equal(col.prepare({ stage: 'mfa' }), '{"stage":"mfa"}');
    assert.isNull(col.prepare(null));
    assert.isNull(col.prepare(undefined));
    assert.deepEqual(col.consume('{"stage":"mfa"}'), { stage: 'mfa' });
    assert.isNull(col.consume(null));
  });
});
