// tests/provider/provider_reload.spec.ts
import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, importJWK, createLocalJWKSet, jwtVerify } from 'jose'
import { KeystoreManager } from '../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../src/keys/keystore_codec.js'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'
import { toPublicJwks } from '../../src/keys/keystore.js'

function mgr(path: string) {
  return new KeystoreManager(new FileKeystoreVault(path), new KeystoreCodec({ encrypt: false }), 'RS256')
}
async function sign(jwk: Record<string, any>, sub: string) {
  const key = await importJWK(jwk, jwk.alg)
  return new SignJWT({ sub }).setProtectedHeader({ alg: jwk.alg, kid: jwk.kid }).setIssuedAt().setExpirationTime('1h').sign(key)
}

test.group('hot-reload viabilidade (jose)', (group) => {
  let dir: string, path: string
  group.each.setup(() => { dir = mkdtempSync(join(tmpdir(), 'authkit-reload-')); path = join(dir, 'jwks.json'); return () => rmSync(dir, { recursive: true, force: true }) })

  test('pós-rotação: JWKS público novo valida token novo E token antigo (overlap)', async ({ assert }) => {
    const m = mgr(path)
    const before = await m.ensure()
    const tokenOld = await sign(before.keys[0], 'u-old')

    // "reload": rotaciona no cofre e relê o keystore (o que reloadKeys fará)
    await m.rotate(2)
    const after = await m.read()
    const tokenNew = await sign(after!.keys[0], 'u-new')

    // o JWKS público pós-reload contém AMBAS as chaves (grace) → ambos validam
    const jwkSet = createLocalJWKSet(toPublicJwks(after!) as any)
    assert.equal((await jwtVerify(tokenOld, jwkSet)).payload.sub, 'u-old')
    assert.equal((await jwtVerify(tokenNew, jwkSet)).payload.sub, 'u-new')

    // e o kid corrente (de assinatura) mudou
    assert.notEqual(after!.keys[0].kid, before.keys[0].kid)
  })
})
