import { test } from '@japa/runner'
import { getTokenFromSource } from '../src/token_source.js'

test.group('token source', () => {
  test('bearer extrai do header Authorization', ({ assert }) => {
    const ctx = { request: { header: (n: string) => (n.toLowerCase() === 'authorization' ? 'Bearer abc.def.ghi' : undefined) } } as any
    assert.equal(getTokenFromSource(ctx, 'bearer', 'authkit'), 'abc.def.ghi')
  })
  test('bearer retorna null sem header', ({ assert }) => {
    const ctx = { request: { header: () => undefined } } as any
    assert.isNull(getTokenFromSource(ctx, 'bearer', 'authkit'))
  })
  test('session lê o idToken do TokenSet guardado', ({ assert }) => {
    const ctx = { session: { get: (k: string) => (k === 'authkit' ? { idToken: 'id.tok.en', accessToken: 'a' } : undefined) } } as any
    assert.equal(getTokenFromSource(ctx, 'session', 'authkit'), 'id.tok.en')
  })
  test('session retorna null sem token set', ({ assert }) => {
    const ctx = { session: { get: () => undefined } } as any
    assert.isNull(getTokenFromSource(ctx, 'session', 'authkit'))
  })
})
