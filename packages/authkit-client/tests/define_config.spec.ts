import { test } from '@japa/runner'
import { configProvider } from '@adonisjs/core'
import { defineConfig, resolvers } from '../src/define_config.js'

test.group('defineConfig (client)', () => {
  test('resolve config com defaults', async ({ assert }) => {
    const provider = defineConfig({
      issuer: 'https://auth.test/oidc', clientId: 'app1', clientSecret: 's',
      redirectUri: 'https://app/cb', resolver: resolvers.jwt(),
    })
    const resolved = await configProvider.resolve({} as any, provider)
    assert.equal(resolved!.issuer, 'https://auth.test/oidc')
    assert.equal(resolved!.sessionKey, 'authkit')
    assert.deepEqual(resolved!.scopes, ['openid', 'profile', 'email', 'offline_access'])
    assert.equal(resolved!.globalRolesClaim, 'roles')
    assert.isOk(resolved!.resolverFactory)
  })
})
