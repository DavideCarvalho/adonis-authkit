import { test } from '@japa/runner'
import { Authenticator } from '../src/authenticator.js'
import { OtelRecorder } from '../src/observability/client_metrics.js'
import { AUTHKIT_METRICS } from '@adonis-agora/authkit-core'

test.group('client metrics', () => {
  test('mede duração do resolve', async ({ assert }) => {
    const recorder = await OtelRecorder.create('authkit-client')
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => ({ userId: 'u1', email: '', globalRoles: [], issuedAt: 0, expiresAt: 0, raw: {} }) } as any,
    }, recorder)
    await auth.getIdentity()
    assert.isAtLeast(recorder.snapshot().histograms[AUTHKIT_METRICS.resolveDuration]?.count ?? 0, 1)
  })

  test('conta erros do resolve', async ({ assert }) => {
    const recorder = await OtelRecorder.create('authkit-client')
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => { throw new Error('x') } } as any,
    }, recorder)
    await auth.getIdentity().catch(() => {})
    assert.equal(recorder.snapshot().counters[AUTHKIT_METRICS.resolveErrors], 1)
  })

  test('sem recorder funciona (no-op default)', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => null } as any,
    })
    assert.isNull(await auth.getIdentity())
  })
})
