import { test } from '@japa/runner'
import { resolvers } from '@adonis-agora/authkit-client'
import { mintTestIdToken, serveJwks, generateTestKeyPair } from '../index.js'

test.group('mintTestIdToken + JwtResolver', () => {
  test('um token emitido valida pelo JwtResolver real via JWKS local', async ({ assert }) => {
    const issuer = 'https://idp.test'
    const clientId = 'app-1'
    const key = await generateTestKeyPair('kid-test-1')

    const { token, jwks } = await mintTestIdToken({
      issuer,
      clientId,
      key,
      claims: { sub: 'user-42', email: 'jane@test.dev', roles: ['ADMIN'] },
    })

    const served = await serveJwks(jwks)
    try {
      const factory = resolvers.jwt({ jwksUri: served.jwksUri })
      const resolver = await factory.resolver({
        issuer,
        clientId,
        sessionKey: 'authkit',
        globalRolesClaim: 'roles',
      })

      const identity = await (resolver as { resolveToken(t: string): Promise<any> }).resolveToken(
        token
      )
      assert.isNotNull(identity)
      assert.equal(identity!.userId, 'user-42')
      assert.equal(identity!.email, 'jane@test.dev')
      assert.deepEqual(identity!.globalRoles, ['ADMIN'])
    } finally {
      await served.close()
    }
  })

  test('um token assinado por outra chave NÃO valida', async ({ assert }) => {
    const issuer = 'https://idp.test'
    const clientId = 'app-1'

    // emite com uma chave, mas serve o JWKS de OUTRA chave
    const { token } = await mintTestIdToken({ issuer, clientId })
    const other = await mintTestIdToken({ issuer, clientId })

    const served = await serveJwks(other.jwks)
    try {
      const factory = resolvers.jwt({ jwksUri: served.jwksUri })
      const resolver = await factory.resolver({
        issuer,
        clientId,
        sessionKey: 'authkit',
        globalRolesClaim: 'roles',
      })
      const identity = await (resolver as { resolveToken(t: string): Promise<any> }).resolveToken(
        token
      )
      assert.isNull(identity)
    } finally {
      await served.close()
    }
  })
})
