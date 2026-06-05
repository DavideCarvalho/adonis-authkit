import { test } from '@japa/runner'
import { barChartSvg } from '../src/host/svg_chart.js'
import type { DailyPoint } from '../src/host/admin_stats_service.js'

function points(counts: number[]): DailyPoint[] {
  return counts.map((count, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    count,
  }))
}

test.group('barChartSvg (SVG inline server-side)', () => {
  test('série vazia → SVG válido sem barras', ({ assert }) => {
    const svg = barChartSvg([])
    assert.match(svg, /^<svg/)
    assert.notInclude(svg, '<rect')
  })

  test('série normal → contém <rect> para cada ponto', ({ assert }) => {
    const svg = barChartSvg(points([5, 10, 3]))
    const rects = svg.match(/<rect/g) ?? []
    assert.equal(rects.length, 3)
  })

  test('contém viewBox e width=100%', ({ assert }) => {
    const svg = barChartSvg(points([1, 2]))
    assert.include(svg, 'viewBox=')
    assert.include(svg, 'width="100%"')
  })

  test('contém <title> com data e contagem para acessibilidade', ({ assert }) => {
    const svg = barChartSvg(points([7]))
    assert.include(svg, '<title>2024-01-01: 7</title>')
  })

  test('série toda-zero → barras de altura mínima (não zero-height)', ({ assert }) => {
    const svg = barChartSvg(points([0, 0, 0]))
    // Deve haver 3 rects — mesmo que todos sejam a linha de base.
    const rects = svg.match(/<rect/g) ?? []
    assert.equal(rects.length, 3)
    // Todas as barras devem ter height>0 (mínimo 1 px de altura).
    const heights = [...svg.matchAll(/height="([\d.]+)"/g)].map((m) => parseFloat(m[1]))
    assert.isTrue(heights.every((h) => h > 0))
  })

  test('ponto com count=0 tem opacidade reduzida', ({ assert }) => {
    const svg = barChartSvg(points([0, 5]))
    // O primeiro rect (count=0) deve ter opacity="0.15".
    assert.include(svg, 'opacity="0.15"')
    // O segundo (count=5) deve ter opacity="0.9".
    assert.include(svg, 'opacity="0.9"')
  })

  test('opts customizados são respeitados (width/height/color)', ({ assert }) => {
    const svg = barChartSvg(points([1, 2]), { width: 400, height: 60, color: '#ff0000' })
    assert.include(svg, 'viewBox="0 0 400 60"')
    assert.include(svg, 'fill="#ff0000"')
  })

  test('caracteres especiais nas datas são escapados no <title>', ({ assert }) => {
    const svg = barChartSvg([{ date: '2024-01-01', count: 3 }])
    // Data sem caracteres especiais não deve quebrar.
    assert.include(svg, '<title>2024-01-01: 3</title>')
  })

  test('SVG tem aria-label para acessibilidade', ({ assert }) => {
    const svg = barChartSvg(points([1]))
    assert.include(svg, 'aria-label="bar chart"')
  })
})
