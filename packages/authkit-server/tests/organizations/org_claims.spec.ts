import { test } from '@japa/runner'
import { ACTIVE_ORG_COOKIE, encodeActiveOrgCookie, decodeActiveOrgCookie } from '../../src/host/active_org_cookie.js'

test.group('active_org_cookie — encode/decode', () => {
  test('encodeActiveOrgCookie / decode round-trip', ({ assert }) => {
    const encoded = encodeActiveOrgCookie({ orgId: 'org-1', orgSlug: 'acme', orgRole: 'admin' })
    assert.isString(encoded)
    const decoded = decodeActiveOrgCookie(encoded)
    assert.deepEqual(decoded, { orgId: 'org-1', orgSlug: 'acme', orgRole: 'admin' })
  })

  test('decodeActiveOrgCookie retorna null para valor inválido', ({ assert }) => {
    assert.isNull(decodeActiveOrgCookie('garbage'))
    assert.isNull(decodeActiveOrgCookie(''))
    assert.isNull(decodeActiveOrgCookie(undefined))
  })

  test('ACTIVE_ORG_COOKIE tem o nome correto', ({ assert }) => {
    assert.equal(ACTIVE_ORG_COOKIE, 'authkit_active_org')
  })

  test('decode retorna null para formato faltando campos', ({ assert }) => {
    assert.isNull(decodeActiveOrgCookie('only-two\tparts'))
    assert.isNull(decodeActiveOrgCookie('\t\t')) // campos vazios
  })
})
