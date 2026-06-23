import { test } from '@japa/runner'
import { OtelRecorder } from '../src/observability/otel_recorder.js'
import { AUTHKIT_METRICS } from '@adonis-agora/authkit-core'

test.group('OtelRecorder', () => {
  test('agrega counters e histograms no snapshot mesmo sem OTel', async ({ assert }) => {
    const rec = await OtelRecorder.create('authkit-server')
    rec.increment(AUTHKIT_METRICS.loginSuccess)
    rec.increment(AUTHKIT_METRICS.loginSuccess)
    rec.record(AUTHKIT_METRICS.passwordHashDuration, 12)
    rec.record(AUTHKIT_METRICS.passwordHashDuration, 8)
    const snap = rec.snapshot()
    assert.equal(snap.counters[AUTHKIT_METRICS.loginSuccess], 2)
    assert.equal(snap.histograms[AUTHKIT_METRICS.passwordHashDuration].count, 2)
    assert.equal(snap.histograms[AUTHKIT_METRICS.passwordHashDuration].sum, 20)
  })
})
