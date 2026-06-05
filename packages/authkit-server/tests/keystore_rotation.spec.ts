import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, importJWK, createLocalJWKSet, jwtVerify } from 'jose'
import { ensureKeystore, rotateKeystore, toPublicJwks } from '../src/keys/keystore.js'

async function signWith(jwk: Record<string, any>, claims: Record<string, unknown>) {
  const key = await importJWK(jwk, jwk.alg)
  return new SignJWT(claims)
    .setProtectedHeader({ alg: jwk.alg, kid: jwk.kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key)
}

test.group('keystore rotation', (group) => {
  let dir: string
  let path: string

  group.each.setup(() => {
    dir = mkdtempSync(join(tmpdir(), 'authkit-ks-'))
    path = join(dir, 'jwks.json')
    return () => rmSync(dir, { recursive: true, force: true })
  })

  test('ensureKeystore cria uma chave e persiste', async ({ assert }) => {
    const store = await ensureKeystore(path, 'RS256')
    assert.lengthOf(store.keys, 1)
    assert.property(store.keys[0], 'd') // chave privada
    // idempotente: segunda chamada não regenera
    const again = await ensureKeystore(path, 'RS256')
    assert.equal(again.keys[0].kid, store.keys[0].kid)
  })

  test('após rotação o JWKS serve 2 chaves e usa um novo kid', async ({ assert }) => {
    const initial = await ensureKeystore(path, 'RS256')
    const oldKid = initial.keys[0].kid

    const { store, newKid } = await rotateKeystore(path, 'RS256', 2)
    assert.lengthOf(store.keys, 2)
    assert.notEqual(newKid, oldKid)
    assert.equal(store.keys[0].kid, newKid) // nova chave na frente (assinatura corrente)
    assert.equal(store.keys[1].kid, oldKid)
  })

  test('tokens assinados antes da rotação ainda validam pelo JWKS público', async ({ assert }) => {
    const initial = await ensureKeystore(path, 'RS256')
    const tokenOld = await signWith(initial.keys[0], { sub: 'u1' })

    const { store } = await rotateKeystore(path, 'RS256', 2)
    const tokenNew = await signWith(store.keys[0], { sub: 'u2' })

    const publicJwks = toPublicJwks(store)
    assert.notProperty(publicJwks.keys[0], 'd') // público não tem 'd'
    const jwkSet = createLocalJWKSet(publicJwks as any)

    const verifiedOld = await jwtVerify(tokenOld, jwkSet)
    assert.equal(verifiedOld.payload.sub, 'u1')
    const verifiedNew = await jwtVerify(tokenNew, jwkSet)
    assert.equal(verifiedNew.payload.sub, 'u2')
  })

  test('keep=2 aposenta as chaves mais antigas', async ({ assert }) => {
    await ensureKeystore(path, 'RS256')
    await rotateKeystore(path, 'RS256', 2)
    const third = await rotateKeystore(path, 'RS256', 2)
    assert.lengthOf(third.store.keys, 2)
    assert.lengthOf(third.retiredKids, 1)
  })
})
