import { test } from '@japa/runner'
import { jwksAutoFallbackWarning } from '../../src/define_config.js'

test.group('jwks auto fallback warning', () => {
  test('warns quando auto cai no fallback de disco (sem AUTHKIT_JWKS)', ({ assert }) => {
    assert.isString(jwksAutoFallbackWarning('tmp/authkit_jwks.json'))
    assert.match(jwksAutoFallbackWarning('tmp/x.json')!, /AUTHKIT_JWKS|disco/i)
  })

  test('não warna quando não é o caso de fallback', ({ assert }) => {
    assert.isNull(jwksAutoFallbackWarning(null))
  })
})
