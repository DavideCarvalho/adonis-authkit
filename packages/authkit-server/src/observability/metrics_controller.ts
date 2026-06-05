import type { HttpContext } from '@adonisjs/core/http'
import type { MetricsSnapshot } from '@dudousxd/adonis-authkit-core'

function renderDashboardHtml(snapshot: MetricsSnapshot): string {
  const counters = Object.entries(snapshot.counters)
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('')
  const histograms = Object.entries(snapshot.histograms)
    .map(
      ([k, h]) =>
        `<tr><td>${k}</td><td>${h.count}</td><td>${h.sum}</td><td>${h.min}</td><td>${h.max}</td></tr>`
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>AuthKit — Metrics</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#111}h1{font-size:1.2rem}table{border-collapse:collapse;margin:1rem 0;width:100%}th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:.9rem}th{background:#f5f5f5}</style>
</head><body><h1>AuthKit — Metrics</h1><p>Updated: ${snapshot.updatedAt ? new Date(snapshot.updatedAt).toISOString() : '—'}</p>
<h2>Counters</h2><table><thead><tr><th>Metric</th><th>Total</th></tr></thead><tbody>${counters || '<tr><td colspan="2">—</td></tr>'}</tbody></table>
<h2>Histograms</h2><table><thead><tr><th>Metric</th><th>Count</th><th>Sum</th><th>Min</th><th>Max</th></tr></thead><tbody>${histograms || '<tr><td colspan="5">—</td></tr>'}</tbody></table>
</body></html>`
}

export default class MetricsController {
  async json(ctx: HttpContext) {
    const recorder = await ctx.containerResolver.make('authkit.metrics')
    return recorder.snapshot()
  }

  async dashboard(ctx: HttpContext) {
    const recorder = await ctx.containerResolver.make('authkit.metrics')
    return ctx.response.type('html').send(renderDashboardHtml(recorder.snapshot()))
  }
}
