import { test } from '@japa/runner'
import { generatePatToken, hashPatToken } from '../src/pat/pat_tokens.js'

test.group('pat_tokens', () => {
  test('generatePatToken gera token com prefixo pat_ e é único', ({ assert }) => {
    const a = generatePatToken()
    const b = generatePatToken()
    assert.match(a, /^pat_[A-Za-z0-9_-]{16,}$/)
    assert.notEqual(a, b)
  })

  test('hashPatToken é determinístico, hex de 64 chars e difere do token cru', ({ assert }) => {
    const token = generatePatToken()
    const h1 = hashPatToken(token)
    const h2 = hashPatToken(token)
    assert.equal(h1, h2)
    assert.match(h1, /^[0-9a-f]{64}$/)
    assert.notEqual(h1, token)
  })
})
