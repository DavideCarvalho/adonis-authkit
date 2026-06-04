import { test } from '@japa/runner'
import RedisMock from 'ioredis-mock'
import { adapters } from '../src/adapters/factory.js'

test.group('adapters factory', () => {
  test('redis() resolve uma classe-adapter usável pelo oidc-provider', async ({ assert }) => {
    const fakeApp = {
      container: { make: async () => ({ connection: () => new RedisMock() }) },
    } as any
    const AdapterClass = await adapters.redis({ connection: 'main', prefix: 'authkit' }).resolver(fakeApp)
    const instance = new AdapterClass('AccessToken')
    await instance.upsert('t', { jti: 't' }, 60)
    assert.deepInclude(await instance.find('t'), { jti: 't' })
  })
})
