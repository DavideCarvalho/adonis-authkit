import { test } from '@japa/runner'
import { createMetricsRecorder } from '../src/observability/metrics_service.js'

test.group('metrics service', () => {
  test('noop quando metrics desligado', async ({ assert }) => {
    const rec = await createMetricsRecorder({ metrics: false }, 'authkit-server')
    rec.increment('authkit.login.success' as any)
    assert.deepEqual(rec.snapshot().counters, {})
  })
  test('agrega quando metrics ligado', async ({ assert }) => {
    const rec = await createMetricsRecorder({ metrics: true }, 'authkit-server')
    rec.increment('authkit.login.success' as any)
    assert.equal(rec.snapshot().counters['authkit.login.success'], 1)
  })
})
