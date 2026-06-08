import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useSettingsQueryOptions,
  useSetSettingMutationOptions,
  useRemoveSettingMutationOptions,
  authkitKeys,
  type SettingEntry,
} from '@dudousxd/adonis-authkit-react'
import { QueryBoundary } from '../components/QueryBoundary'
import { Skeleton } from '../components/Skeleton'
import { useToast } from '../lib/toast'

// ── Setting meta types ────────────────────────────────────────────────────────

export interface SettingMeta {
  key: string
  label: string
  description: string
  type: 'boolean' | 'number' | 'string' | 'json'
  defaultValue?: unknown
}

// ── Skeleton for a settings section ──────────────────────────────────────────

function SettingsSectionSkeleton({ rowCount = 4 }: { rowCount?: number }) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: rowCount }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 16px',
            borderBottom: i < rowCount - 1 ? '1px solid var(--line)' : undefined,
            gap: 16,
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width="40%" height={13} />
            <Skeleton width="70%" height={11} />
          </div>
          <Skeleton width={44} height={24} borderRadius={12} />
        </div>
      ))}
    </div>
  )
}

// ── SettingsSectionContainer ──────────────────────────────────────────────────

interface SettingsSectionContainerProps {
  section: { title: string; description: string; keys: SettingMeta[] }
  onUnavailable: () => void
}

export function SettingsSectionContainer({ section, onUnavailable }: SettingsSectionContainerProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [checkedUnavailable, setCheckedUnavailable] = useState(false)
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const { data, isLoading, error, refetch } = useQuery({
    ...useSettingsQueryOptions(),
    retry: (failureCount, err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        if (!checkedUnavailable) {
          setCheckedUnavailable(true)
          onUnavailable()
        }
        return false
      }
      return failureCount < 1
    },
  })
  const settings = data?.data ?? []
  // Keys travadas via defineConfig — config vence e a edição pela UI fica bloqueada.
  const lockedKeys: string[] = (data as { locked?: string[] } | undefined)?.locked ?? []

  // Sync local values when settings load
  useEffect(() => {
    if (!data) return
    const initial: Record<string, unknown> = {}
    for (const s of data.data) initial[s.key] = s.value
    setLocalValues(initial)
    setDirtyKeys(new Set())
  }, [data])

  const setSettingMutation = useMutation(useSetSettingMutationOptions())
  const removeSettingMutation = useMutation(useRemoveSettingMutationOptions())

  function getValue(key: string, meta: SettingMeta): unknown {
    if (key in localValues) return localValues[key]
    const stored = settings.find((s) => s.key === key)
    if (stored) return stored.value
    return meta.defaultValue
  }

  function isDefault(key: string): boolean {
    return !settings.some((s) => s.key === key)
  }

  function setValue(key: string, value: unknown) {
    setLocalValues((prev) => ({ ...prev, [key]: value }))
    setDirtyKeys((prev) => new Set([...prev, key]))
  }

  async function saveSetting(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      const value = localValues[key]
      await setSettingMutation.mutateAsync({ key, value })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings() })
      setDirtyKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
      toast.success(`Saved: ${key}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  async function resetSetting(key: string) {
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      await removeSettingMutation.mutateAsync(key)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings() })
      setLocalValues((prev) => { const n = { ...prev }; delete n[key]; return n })
      setDirtyKeys((prev) => { const s = new Set(prev); s.delete(key); return s })
      toast.success(`Reset to default: ${key}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  const isNotFound = error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404
  const displayError = error && !isNotFound ? error : undefined

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <div>
          <h3>{section.title}</h3>
          <p style={{ marginTop: 2 }}>{section.description}</p>
        </div>
      </div>

      <QueryBoundary
        isLoading={isLoading}
        error={displayError}
        onRetry={refetch}
        skeleton={<SettingsSectionSkeleton rowCount={section.keys.length} />}
      >
        <div className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            {section.keys.map((meta) => {
              const val = getValue(meta.key, meta)
              const fromDefault = isDefault(meta.key)
              const isDirty = dirtyKeys.has(meta.key)
              const isSaving = saving[meta.key]
              // Travada via defineConfig: config manda, UI só leitura.
              const locked = lockedKeys.includes(meta.key)
              const lockedTitle = 'Definido via defineConfig() — gerenciado no código, não editável aqui'

              return (
                <div key={meta.key} className="settings-row" style={locked ? { opacity: 0.85 } : undefined}>
                  <div className="settings-info">
                    <div className="settings-key">
                      {meta.label}
                      {locked ? (
                        <span
                          className="settings-badge"
                          title={lockedTitle}
                          style={{ background: 'var(--accent-soft, rgba(99,102,241,0.12))', color: 'var(--accent, #6366f1)', borderColor: 'rgba(99,102,241,0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <rect x="3" y="7" width="10" height="7" rx="1.5" />
                            <path d="M5 7V5a3 3 0 016 0v2" strokeLinecap="round" />
                          </svg>
                          definido via config
                        </span>
                      ) : (
                        <span className="settings-badge">{fromDefault ? 'default' : 'custom'}</span>
                      )}
                      {isDirty && !locked && (
                        <span className="settings-badge" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', borderColor: 'rgba(255,180,84,0.3)' }}>
                          unsaved
                        </span>
                      )}
                    </div>
                    <div className="settings-desc">{meta.description}</div>
                    {locked && (
                      <div className="settings-desc" style={{ color: 'var(--accent, #6366f1)', marginTop: 2 }}>
                        Travado no <code>defineConfig()</code>. Remova de lá para editar pela UI.
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--mono)', marginTop: 2 }}>{meta.key}</div>
                  </div>

                  <div className="settings-control">
                    {meta.type === 'boolean' ? (
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          disabled={locked}
                          onChange={(e) => setValue(meta.key, e.target.checked)}
                        />
                        <div className="toggle-track" />
                        <div className="toggle-thumb" />
                      </label>
                    ) : meta.type === 'number' ? (
                      <input
                        className="input input-mono"
                        type="number"
                        style={{ width: 90, textAlign: 'right' }}
                        value={String(val ?? meta.defaultValue ?? 0)}
                        disabled={locked}
                        onChange={(e) => setValue(meta.key, Number(e.target.value))}
                      />
                    ) : (
                      <input
                        className="input"
                        style={{ width: 200 }}
                        value={String(val ?? meta.defaultValue ?? '')}
                        disabled={locked}
                        onChange={(e) => setValue(meta.key, e.target.value)}
                      />
                    )}

                    {isDirty && !locked && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={isSaving}
                        onClick={() => saveSetting(meta.key)}
                      >
                        {isSaving ? <span className="spinner sm" /> : 'Save'}
                      </button>
                    )}

                    {!fromDefault && !isDirty && !locked && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={isSaving}
                        onClick={() => resetSetting(meta.key)}
                        title="Reset to default"
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M2 8a6 6 0 016-6 6 6 0 014.24 1.76L14 5" strokeLinecap="round" />
                          <path d="M14 2v3h-3" strokeLinecap="round" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </QueryBoundary>
    </div>
  )
}
