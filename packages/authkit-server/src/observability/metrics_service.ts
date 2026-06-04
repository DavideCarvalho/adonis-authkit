import { NoopRecorder, type MetricsRecorder, type ObservabilityConfig } from '@dudousxd/adonis-authkit-core'
import { OtelRecorder } from './otel_recorder.js'

export async function createMetricsRecorder(
  observability: ObservabilityConfig,
  meterName: string
): Promise<MetricsRecorder> {
  if (!observability.metrics) return new NoopRecorder()
  return OtelRecorder.create(meterName)
}
