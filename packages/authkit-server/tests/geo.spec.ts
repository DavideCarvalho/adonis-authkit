import { test } from '@japa/runner'
import { resolveGeoSafe } from '../src/host/geo.js'

test.group('resolveGeoSafe (geo plugável + fail-safe)', () => {
  test('sem hook → null', async ({ assert }) => {
    assert.isNull(await resolveGeoSafe(undefined, '1.2.3.4'))
  })

  test('sem IP → null (mesmo com hook)', async ({ assert }) => {
    assert.isNull(await resolveGeoSafe(async () => 'São Paulo, BR', null))
    assert.isNull(await resolveGeoSafe(async () => 'São Paulo, BR', undefined))
  })

  test('hook resolve → devolve a localização', async ({ assert }) => {
    const geo = resolveGeoSafe(async (ip) => `loc:${ip}`, '8.8.8.8')
    assert.equal(await geo, 'loc:8.8.8.8')
  })

  test('hook síncrono também funciona', async ({ assert }) => {
    assert.equal(await resolveGeoSafe((ip) => `sync:${ip}`, '8.8.8.8'), 'sync:8.8.8.8')
  })

  test('hook devolve null/vazio → null', async ({ assert }) => {
    assert.isNull(await resolveGeoSafe(async () => null, '8.8.8.8'))
    assert.isNull(await resolveGeoSafe(async () => '', '8.8.8.8'))
  })

  test('hook lança → null (fail-safe, não propaga)', async ({ assert }) => {
    assert.isNull(
      await resolveGeoSafe(async () => {
        throw new Error('boom')
      }, '8.8.8.8')
    )
  })

  test('hook trava além do timeout → null', async ({ assert }) => {
    const slow = () => new Promise<string>((r) => setTimeout(() => r('tarde'), 200))
    const result = await resolveGeoSafe(slow, '8.8.8.8', 30)
    assert.isNull(result)
  })
})
