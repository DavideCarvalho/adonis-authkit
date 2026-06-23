import { test } from '@japa/runner'
import { OtelRecorder } from '../src/observability/otel_recorder.js'
import MetricsController from '../src/observability/metrics_controller.js'
import { AUTHKIT_METRICS } from '@adonis-agora/authkit-core'

test.group('metrics route', () => {
  test('json() devolve o snapshot agregado', async ({ assert }) => {
    const recorder = await OtelRecorder.create('test')
    recorder.increment(AUTHKIT_METRICS.loginSuccess)
    const ctx = { containerResolver: { make: async () => recorder } } as any
    const body = await new MetricsController().json(ctx)
    assert.equal(body.counters[AUTHKIT_METRICS.loginSuccess], 1)
    assert.isNumber(body.updatedAt)
  })

  test('dashboard() devolve HTML com os counters', async ({ assert }) => {
    const recorder = await OtelRecorder.create('test')
    recorder.increment(AUTHKIT_METRICS.tokenIssued)
    let sentType = ''
    let sentBody = ''
    const ctx = {
      containerResolver: { make: async () => recorder },
      response: {
        type: (t: string) => {
          sentType = t
          return ctx.response
        },
        send: (b: string) => {
          sentBody = b
        },
      },
    } as any
    await new MetricsController().dashboard(ctx)
    assert.include(sentType, 'html')
    assert.include(sentBody, 'authkit.token.issued')
    assert.include(sentBody, 'AuthKit')
  })
})
