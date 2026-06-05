import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, importJWK, createLocalJWKSet, jwtVerify } from 'jose'
import {
  ensureKeystore,
  rotateKeystore,
  toPublicJwks,
  planRotation,
  readKeystore,
  signingKeyAgeDays,
} from '../src/keys/keystore.js'

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

  test('retire=true mantém SÓ a nova chave (aposenta todas as antigas)', async ({ assert }) => {
    await ensureKeystore(path, 'RS256')
    await rotateKeystore(path, 'RS256', 3) // 2 chaves
    const retired = await rotateKeystore(path, 'RS256', 3, true)
    assert.lengthOf(retired.store.keys, 1) // só a nova
    assert.equal(retired.store.keys[0].kid, retired.newKid)
    assert.isAbove(retired.retiredKids.length, 0)
  })

  test('planRotation (dry-run) calcula o plano SEM tocar o keystore', async ({ assert }) => {
    const initial = await ensureKeystore(path, 'RS256')
    const before = readKeystore(path)

    const plan = planRotation(before, 2, false)
    assert.equal(plan.currentKid, initial.keys[0].kid)
    assert.equal(plan.keep, 2)
    assert.equal(plan.keptKids[0], '<new>')
    assert.include(plan.keptKids, initial.keys[0].kid)
    assert.lengthOf(plan.retiredKids, 0)

    // dry-run não persiste nada: o keystore continua idêntico.
    const after = readKeystore(path)
    assert.deepEqual(after, before)
  })

  test('planRotation com retire projeta a aposentadoria de todas as antigas', async ({ assert }) => {
    await ensureKeystore(path, 'RS256')
    await rotateKeystore(path, 'RS256', 3) // 2 chaves no store
    const store = readKeystore(path)
    const plan = planRotation(store, 3, true)
    assert.equal(plan.keep, 1)
    assert.deepEqual(plan.keptKids, ['<new>'])
    assert.lengthOf(plan.retiredKids, 2) // ambas antigas seriam removidas
  })

  test('signingKeyAgeDays lê o carimbo iat da chave corrente', async ({ assert }) => {
    const store = await ensureKeystore(path, 'RS256')
    assert.property(store.keys[0], 'iat') // metadado de idade gravado
    assert.equal(signingKeyAgeDays(store), 0) // recém-criada
    // chave sem iat → null (degrada sem quebrar).
    assert.isNull(signingKeyAgeDays({ keys: [{ kid: 'x' }] }))
    assert.isNull(signingKeyAgeDays(null))
  })

  test('toPublicJwks remove o metadado interno iat', async ({ assert }) => {
    const store = await ensureKeystore(path, 'RS256')
    const pub = toPublicJwks(store)
    assert.notProperty(pub.keys[0], 'iat')
    assert.notProperty(pub.keys[0], 'd')
  })
})
