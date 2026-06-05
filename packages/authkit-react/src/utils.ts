/**
 * Helpers puros e SSR-safe (não tocam em `window` no nível de módulo).
 */

/**
 * Deriva iniciais a partir de um nome (ou e-mail como fallback).
 * Ex.: "Ana Maria Silva" → "AS"; "ana@b.com" → "A".
 */
export function deriveInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? '').trim()
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  const e = (email ?? '').trim()
  if (e) return e[0]!.toUpperCase()
  return '?'
}

/** Lê o pathname+search atual de forma SSR-safe (vazio no servidor). */
export function currentUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname + window.location.search
}
