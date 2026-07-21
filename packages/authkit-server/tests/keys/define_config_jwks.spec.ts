import { test } from '@japa/runner';
import { defaultEncryptForStore, jwksAutoFallbackWarning } from '../../src/define_config.js';

test.group('jwks auto fallback warning', () => {
  test('warns quando auto cai no fallback de disco (sem AUTHKIT_JWKS)', ({ assert }) => {
    assert.isString(jwksAutoFallbackWarning('tmp/authkit_jwks.json'));
    assert.match(jwksAutoFallbackWarning('tmp/x.json')!, /AUTHKIT_JWKS|disco/i);
  });

  test('não warna quando não é o caso de fallback', ({ assert }) => {
    assert.isNull(jwksAutoFallbackWarning(null));
  });
});

test.group('default de encrypt backend-aware', () => {
  test('file/string/drive → ON', ({ assert }) => {
    assert.isTrue(defaultEncryptForStore('tmp/x.json'));
    assert.isTrue(defaultEncryptForStore({ driver: 'file', path: 'x' }));
    assert.isTrue(defaultEncryptForStore({ driver: 'drive', key: 'k' }));
  });
  test('vault real → OFF', ({ assert }) => {
    assert.isFalse(defaultEncryptForStore({ driver: 'aws-secrets-manager', secretId: 's' } as any));
  });
});

test.group('default de encrypt — lucid/redis', () => {
  test('lucid/redis → ON (blobs burros)', ({ assert }) => {
    assert.isTrue(defaultEncryptForStore({ driver: 'lucid' } as any));
    assert.isTrue(defaultEncryptForStore({ driver: 'redis' } as any));
  });
});
