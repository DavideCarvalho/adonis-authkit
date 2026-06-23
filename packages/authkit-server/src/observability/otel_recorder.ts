import {
  InMemorySnapshot,
  type AuthkitMetricName,
  type MetricsRecorder,
  type MetricsSnapshot,
} from '@adonis-agora/authkit-core'

type Counter = { add(value: number, attrs?: Record<string, any>): void }
type Histogram = { record(value: number, attrs?: Record<string, any>): void }

/** Recorder que (best-effort) emite via @opentelemetry/api e SEMPRE agrega em memória. */
export class OtelRecorder implements MetricsRecorder {
  #snapshot = new InMemorySnapshot()
  #counters = new Map<string, Counter>()
  #histograms = new Map<string, Histogram>()
  #meter: any | null

  private constructor(meter: any | null) {
    this.#meter = meter
  }

  static async create(name: string): Promise<OtelRecorder> {
    let meter: any | null = null
    try {
      // Specifier dinâmico (não-estático) para que o TS não tente resolver o
      // peer opcional @opentelemetry/api em tempo de compilação. Em runtime,
      // se o pacote não estiver instalado, caímos no catch e ficamos no-op.
      const moduleName = '@opentelemetry/api'
      const otel: any = await import(moduleName)
      meter = otel.metrics.getMeter(name)
    } catch {
      meter = null
    }
    return new OtelRecorder(meter)
  }

  increment(name: AuthkitMetricName, attributes?: Record<string, string | number>): void {
    this.#snapshot.bump(name)
    if (!this.#meter) return
    let c = this.#counters.get(name)
    if (!c) {
      c = this.#meter.createCounter(name)
      this.#counters.set(name, c!)
    }
    c!.add(1, attributes)
  }

  record(name: AuthkitMetricName, value: number, attributes?: Record<string, string | number>): void {
    this.#snapshot.observe(name, value)
    if (!this.#meter) return
    let h = this.#histograms.get(name)
    if (!h) {
      h = this.#meter.createHistogram(name)
      this.#histograms.set(name, h!)
    }
    h!.record(value, attributes)
  }

  snapshot(): MetricsSnapshot {
    return this.#snapshot.read()
  }
}
