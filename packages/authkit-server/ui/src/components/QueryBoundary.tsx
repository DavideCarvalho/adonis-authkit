import React from 'react'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'

// ── Shared error-box style (matches globals.css .error-box) ──────────────────

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 'var(--radius)',
        background: 'var(--red-soft)',
        border: '1px solid rgba(255,84,112,0.20)',
        color: 'var(--red)',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 5v3.5M8 10.5v.5" strokeLinecap="round" />
        </svg>
        <span style={{ fontWeight: 600 }}>Something went wrong</span>
      </div>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{message}</span>
      <button
        onClick={resetErrorBoundary}
        style={{
          alignSelf: 'flex-start',
          marginTop: 2,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 600,
          background: 'var(--red-soft)',
          border: '1px solid rgba(255,84,112,0.30)',
          color: 'var(--red)',
          borderRadius: 7,
          cursor: 'pointer',
          fontFamily: 'var(--sans)',
        }}
      >
        Try again
      </button>
    </div>
  )
}

// ── QueryBoundary ─────────────────────────────────────────────────────────────
//
// Pattern:
//   - Wraps children in <ErrorBoundary> that auto-resets when the QueryClient
//     resets errors (useQueryErrorResetBoundary), so "Try again" also refetches.
//   - Accepts `isLoading`, `error`, `onRetry`, `skeleton` props to handle the
//     fetch-state layer (query.error / query.isLoading) explicitly — these are
//     rendered directly (no Suspense needed, keeps Strict Mode safe).
//   - Render errors (bugs in child components) are caught by ErrorBoundary.

interface QueryBoundaryProps {
  /** Whether the primary query is loading */
  isLoading?: boolean
  /** Fetch error from the query (not a render error) */
  error?: unknown
  /** Called when the user clicks "Try again" in the fetch-error state */
  onRetry?: () => void
  /** Skeleton shown while isLoading is true */
  skeleton?: React.ReactNode
  children: React.ReactNode
}

export function QueryBoundary({
  isLoading,
  error,
  onRetry,
  skeleton,
  children,
}: QueryBoundaryProps) {
  const { reset } = useQueryErrorResetBoundary()

  if (isLoading) {
    return <>{skeleton ?? <DefaultSkeleton />}</>
  }

  if (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    return (
      <ErrorFallback
        error={err}
        resetErrorBoundary={() => {
          reset()
          onRetry?.()
        }}
      />
    )
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
      {children}
    </ErrorBoundary>
  )
}

// ── Default skeleton (used when no skeleton prop is provided) ─────────────────

function DefaultSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            borderRadius: 6,
            background: 'var(--bg3)',
            backgroundImage: 'linear-gradient(90deg, var(--bg3) 0%, var(--bg2) 40%, var(--bg3) 100%)',
            backgroundSize: '200% 100%',
            animation: 'sk-shimmer 1.6s ease-in-out infinite',
            width: i === 3 ? '55%' : '100%',
          }}
        />
      ))}
    </div>
  )
}
