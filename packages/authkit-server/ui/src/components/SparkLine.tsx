import React from 'react'

interface SparkLineProps {
  data: Array<{ date: string; count: number }>
  color?: string
  height?: number
}

export function SparkLine({ data, color = 'var(--accent)', height = 60 }: SparkLineProps) {
  if (!data || data.length === 0) return <div style={{ height }} />

  const max = Math.max(...data.map((d) => d.count), 1)
  const w = 600
  const h = height
  const pad = 4

  const points = data.map((d, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2)
    const y = h - pad - ((d.count / max) * (h - pad * 2))
    return { x, y, count: d.count }
  })

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L${points[points.length - 1].x.toFixed(1)} ${h} L${points[0].x.toFixed(1)} ${h} Z`

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`grad-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path
        d={area}
        fill={`url(#grad-${color.replace(/[^a-z]/gi, '')})`}
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3.5"
          fill={color}
          opacity={i === points.length - 1 ? 1 : 0}
        />
      ))}
    </svg>
  )
}
