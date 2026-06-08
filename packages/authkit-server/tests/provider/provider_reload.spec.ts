// tests/provider/provider_reload.spec.ts
import { test } from '@japa/runner'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SignJWT, importJWK, createLocalJWKSet, jwtVerify } from 'jose'
import { createServer, type Server } from 'node:http'
import RedisMock from 'ioredis-mock'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../../src/define_config.js'
import { OidcService } from '../../src/provider/oidc_service.js'
import { KeystoreManager } from '../../src/keys/keystore_manager.js'
import { KeystoreCodec } from '../../src/keys/keystore_codec.js'
import { FileKeystoreVault } from '../../src/keys/keystore_vault.js'
import { toPublicJwks } from '../../src/keys/keystore.js'
import { fakeAccountStore } from '../bootstrap.js'

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

test.group('OidcService.reloadKeys (e2e)', (group) => {
  let dir: string, path: string, server: Server, service: OidcService
  const PORT = 9791
  const ISSUER = `http://localhost:${PORT}`

  group.each.setup(async () => {
    dir = mkdtempSync(join(tmpdir(), 'authkit-svc-'))
    path = join(dir, 'jwks.json')
    const m = mgr(path)
    const fakeApp = {
      container: { make: async () => ({ connection: () => new RedisMock() }) },
      makePath: (p: string) => p,
    } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer: ISSUER,
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256', store: path, encrypt: false },
        clients: [
          {
            clientId: 'app1',
            clientSecret: 's',
            redirectUris: [`${ISSUER}/cb`],
            grants: ['authorization_code'],
          },
        ],
        accountStore: fakeAccountStore(),
      })
    )
    service = new OidcService(cfg!, 'a'.repeat(32), undefined, {
      jwksLoader: async () => {
        const s = (await m.read())!
        return { keys: s.keys.map(({ iat, ...j }: any) => j) }
      },
      keystoreHead: () => m.head(),
    })
    server = createServer((req, res) => service.callback(req, res))
    await new Promise<void>((r) => server.listen(PORT, r))
    return async () => {
      await new Promise<void>((r) => server.close(() => r()))
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('reloadKeys publica o kid novo mantendo o antigo (overlap) ao vivo', async ({ assert }) => {
    const fetchKids = async () => {
      const disco = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json()
      const jwks = await (await fetch(disco.jwks_uri)).json()
      return jwks.keys.map((k: any) => k.kid)
    }

    const before = await fetchKids()
    assert.lengthOf(before, 1)

    // rotaciona no cofre e recarrega AO VIVO (sem recriar o service)
    await mgr(path).rotate(2)
    await service.reloadKeys()

    const after = await fetchKids()
    assert.lengthOf(after, 2)              // overlap: 2 chaves publicadas
    assert.include(after, before[0])       // a antiga continua publicada
    assert.notDeepEqual(after, before)     // mudou
  })

  test('reloadKeys sem jwksLoader é no-op (não lança)', async ({ assert }) => {
    const fakeApp2 = {
      container: { make: async () => ({ connection: () => new RedisMock() }) },
      makePath: (p: string) => p,
    } as any
    const svc = new OidcService(
      (await configProvider.resolve(
        fakeApp2,
        defineConfig({
          issuer: `http://localhost:${PORT + 1}`,
          adapter: adapters.redis({ connection: 'main' }),
          jwks: { source: 'managed', algorithm: 'RS256' },
          clients: [],
          accountStore: fakeAccountStore(),
        })
      ))!,
      'a'.repeat(32)
    )
    await svc.reloadKeys() // no jwksLoader → no-op
    assert.isOk(svc.provider)
  })
})
