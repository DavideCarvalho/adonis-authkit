import React from 'react';

// ── Base shimmer ──────────────────────────────────────────────────────────────

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: React.CSSProperties;
  className?: string;
}

export function Skeleton({
  width,
  height = 14,
  borderRadius = 6,
  style,
  className,
}: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width: width ?? '100%',
        height,
        borderRadius,
        background: 'var(--bg3)',
        backgroundImage: 'linear-gradient(90deg, var(--bg3) 0%, var(--bg2) 40%, var(--bg3) 100%)',
        backgroundSize: '200% 100%',
        animation: 'sk-shimmer 1.6s ease-in-out infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// ── Inject keyframes once ─────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
  const id = '__sk_shimmer_kf';
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes sk-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// ── Variant: text lines ───────────────────────────────────────────────────────

interface SkeletonLinesProps {
  lines?: number;
  lastWidth?: string;
}

export function SkeletonLines({ lines = 3, lastWidth = '60%' }: SkeletonLinesProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? lastWidth : '100%'} height={13} />
      ))}
    </div>
  );
}

// ── Variant: stat card ────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <Skeleton width={80} height={11} />
      <Skeleton width={60} height={28} borderRadius={8} />
      <Skeleton width={100} height={11} />
    </div>
  );
}

// ── Variant: cards grid ───────────────────────────────────────────────────────

interface SkeletonCardsProps {
  count?: number;
  columns?: number;
}

export function SkeletonCards({ count = 6, columns = 3 }: SkeletonCardsProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 12,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Variant: table rows ───────────────────────────────────────────────────────

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 4 }: SkeletonTableProps) {
  return (
    <div style={{ padding: '0 0 8px' }}>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} height={11} width="50%" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              height={13}
              width={c === 0 ? '80%' : c === cols - 1 ? '40%' : '65%'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Variant: panel with header + table ───────────────────────────────────────

interface SkeletonPanelTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonPanelTable({ rows = 5, cols = 4 }: SkeletonPanelTableProps) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {/* Panel head */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <Skeleton width={200} height={13} />
      </div>
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  );
}

// ── Variant: drawer section ───────────────────────────────────────────────────

export function SkeletonDrawerSection() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Avatar + info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Skeleton width={44} height={44} borderRadius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={11} />
        </div>
      </div>
      {/* Section 1 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={80} height={10} />
        <Skeleton height={32} borderRadius={8} />
      </div>
      {/* Section 2 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={80} height={10} />
        <SkeletonLines lines={3} lastWidth="50%" />
      </div>
    </div>
  );
}
