import type { DailyPoint } from './admin_stats_service.js'

/**
 * Gera um gráfico de BARRAS em SVG inline (server-side, SEM nenhuma lib de chart e
 * SEM JS no cliente) a partir de uma série diária. Estilo enxuto, consistente com o
 * visual Tailwind do console (cor passável). Cada barra ganha um `<title>` para o
 * tooltip nativo do browser (data + contagem) — acessível sem JS.
 *
 * A altura é normalizada pelo maior valor da série; séries todas-zero rendem barras
 * de altura mínima (linha de base). O SVG é responsivo (`width: 100%`) via viewBox.
 */
export function barChartSvg(
  series: DailyPoint[],
  opts: { width?: number; height?: number; color?: string } = {}
): string {
  const width = opts.width ?? 600
  const height = opts.height ?? 80
  const color = opts.color ?? '#111827' // gray-900
  const n = series.length
  if (n === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-hidden="true"></svg>`
  }

  const max = Math.max(1, ...series.map((p) => p.count))
  const gap = 2
  const barWidth = Math.max(1, (width - gap * (n - 1)) / n)
  const minBar = 1

  const bars = series
    .map((p, i) => {
      const x = i * (barWidth + gap)
      const h = p.count > 0 ? Math.max(minBar, (p.count / max) * (height - 2)) : minBar
      const y = height - h
      const title = `${escapeXml(p.date)}: ${p.count}`
      return (
        `<rect x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(h)}" ` +
        `rx="1" fill="${color}" opacity="${p.count > 0 ? 0.9 : 0.15}">` +
        `<title>${title}</title></rect>`
      )
    })
    .join('')

  return (
    `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="none" ` +
    `role="img" aria-label="bar chart">${bars}</svg>`
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
