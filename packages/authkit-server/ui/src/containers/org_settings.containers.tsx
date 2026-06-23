import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useSettingsQueryOptions,
  useSetSettingMutationOptions,
  useRemoveSettingMutationOptions,
  authkitKeys,
} from '@adonis-agora/authkit-react'
import { FieldRow, Toggle, ChipsEditor } from '../components/forms'
import { useToast } from '../lib/toast'

/**
 * Keys de settings que fazem sentido por organização.
 * As demais (bot_protection, lockout, rate_limit, etc.) são GLOBAIS
 * e permanecem somente na página global de Settings.
 */
const ORG_SCOPABLE_KEYS = ['organizations_policy', 'roles_catalog'] as const

type OrgScopableKey = (typeof ORG_SCOPABLE_KEYS)[number]

const ORG_SETTING_LABELS: Record<OrgScopableKey, { en: string; pt: string }> = {
  organizations_policy: {
    en: 'Organizations policy',
    pt: 'Política de organizações',
  },
  roles_catalog: {
    en: 'Roles catalog',
    pt: 'Catálogo de papéis',
  },
}

// ── Valores tipados + normalização na borda ──────────────────────────────────
// Os settings chegam do servidor como JSON sem shape garantido. Normalizamos
// UMA vez aqui (defaults aplicados) e o resto do módulo trabalha 100% tipado.

/** Roles de organização oferecidos nos selects (espelha o default da lib). */
export const DEFAULT_ORG_ROLES = ['owner', 'admin', 'member']

export interface OrgPolicyValue {
  allowSelfCreate: boolean
  invitationTtlHours: number
  roles: string[]
}

export interface RoleCatalogEntry {
  name: string
  description?: string
}

export interface RolesCatalogValue {
  roles: RoleCatalogEntry[]
}

function normalizeOrgPolicy(value: unknown): OrgPolicyValue {
  const v = (value ?? {}) as Partial<OrgPolicyValue>
  return {
    allowSelfCreate: Boolean(v.allowSelfCreate),
    invitationTtlHours: Number(v.invitationTtlHours) || 168,
    roles: Array.isArray(v.roles) && v.roles.length ? v.roles.map(String) : DEFAULT_ORG_ROLES,
  }
}

function normalizeRolesCatalog(value: unknown): RolesCatalogValue {
  const v = (value ?? {}) as Partial<RolesCatalogValue>
  const roles = Array.isArray(v.roles) && v.roles.length
    ? v.roles
    : [{ name: 'ADMIN', description: 'Full access to the admin console' }]
  return {
    roles: roles.map((r) => ({ name: String(r.name), description: r.description ? String(r.description) : undefined })),
  }
}

// ── OrgSettingsSection ────────────────────────────────────────────────────────

export function OrgSettingsSection({ orgId }: { orgId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: orgSettings, isLoading } = useQuery({ ...useSettingsQueryOptions(orgId), retry: false })
  const { data: globalSettings } = useQuery({ ...useSettingsQueryOptions(null), retry: false })

  const setMutation = useMutation(useSetSettingMutationOptions(orgId))
  const removeMutation = useMutation(useRemoveSettingMutationOptions(orgId))

  const [editingKey, setEditingKey] = useState<OrgScopableKey | null>(null)

  const orgEntries = orgSettings?.data ?? []
  const globalEntries = globalSettings?.data ?? []

  function getOrgEntry(key: OrgScopableKey) {
    return orgEntries.find((e) => e.key === key) ?? null
  }
  function getGlobalEntry(key: OrgScopableKey) {
    return globalEntries.find((e) => e.key === key) ?? null
  }

  async function handleSave(key: OrgScopableKey, value: unknown) {
    try {
      await setMutation.mutateAsync({ key, value })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings(orgId) })
      toast.success('Setting saved for this organization')
      setEditingKey(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save setting')
    }
  }

  async function handleRemove(key: OrgScopableKey) {
    try {
      await removeMutation.mutateAsync(key)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings(orgId) })
      toast.success('Organization setting removed (falls back to global)')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove setting')
    }
  }

  if (isLoading) return null

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 12 }}>
        Organization Settings
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ORG_SCOPABLE_KEYS.map((key) => {
          const orgEntry = getOrgEntry(key)
          const globalEntry = getGlobalEntry(key)
          const label = ORG_SETTING_LABELS[key]

          // Badge: from org > from global > default
          const sourceBadge = orgEntry
            ? { text: 'from org', color: 'var(--accent, #4f46e5)' }
            : globalEntry
              ? { text: 'from global', color: 'var(--muted)' }
              : { text: 'default', color: 'var(--faint)' }

          const isEditing = editingKey === key
          /** Valor herdado que pré-popula o form quando não há override da org. */
          const inherited: unknown = orgEntry?.value ?? globalEntry?.value ?? null

          return (
            <div key={key} style={{ background: 'var(--surface, var(--bg))', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isEditing ? 10 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label.en}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label.pt}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'transparent',
                    border: `1px solid ${sourceBadge.color}`,
                    color: sourceBadge.color,
                    fontWeight: 600,
                  }}
                >
                  {sourceBadge.text}
                </span>
                {!isEditing && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(key)}>
                      {orgEntry ? 'Edit' : 'Override'}
                    </button>
                    {orgEntry && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemove(key)}
                        disabled={removeMutation.isPending}
                        style={{ color: 'var(--danger, #e53e3e)' }}
                        title="Remove org override (falls back to global)"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </div>

              {key === 'organizations_policy' && (
                isEditing ? (
                  <OrgPolicyForm
                    initial={normalizeOrgPolicy(inherited)}
                    saving={setMutation.isPending}
                    onSave={(value) => handleSave(key, value)}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <OrgPolicySummary value={normalizeOrgPolicy(inherited)} />
                )
              )}
              {key === 'roles_catalog' && (
                isEditing ? (
                  <RolesCatalogForm
                    initial={normalizeRolesCatalog(inherited)}
                    saving={setMutation.isPending}
                    onSave={(value) => handleSave(key, value)}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <RolesCatalogSummary value={normalizeRolesCatalog(inherited)} />
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Summaries (leitura do valor efetivo, fora do modo de edição) ─────────────

function OrgPolicySummary({ value }: { value: OrgPolicyValue }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span className="badge badge-muted">self-create: {value.allowSelfCreate ? 'on' : 'off'}</span>
      <span className="badge badge-muted">invite TTL: {value.invitationTtlHours}h</span>
      {value.roles.map((r) => (
        <span key={r} className="badge badge-muted">{r}</span>
      ))}
    </div>
  )
}

function RolesCatalogSummary({ value }: { value: RolesCatalogValue }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {value.roles.map((r) => (
        <span key={r.name} className="badge badge-muted" title={r.description ?? ''}>{r.name}</span>
      ))}
    </div>
  )
}

// ── Setting forms (estruturados — nada de JSON cru) ──────────────────────────

function OrgPolicyForm({ initial, saving, onSave, onCancel }: {
  initial: OrgPolicyValue
  saving: boolean
  onSave: (value: OrgPolicyValue) => void
  onCancel: () => void
}) {
  const [allowSelfCreate, setAllowSelfCreate] = useState(initial.allowSelfCreate)
  const [ttlHours, setTtlHours] = useState(initial.invitationTtlHours)
  const [roles, setRoles] = useState(initial.roles)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Allow self-create" hint="Members can create their own organizations">
        <Toggle checked={allowSelfCreate} onChange={setAllowSelfCreate} />
      </FieldRow>
      <FieldRow label="Invitation TTL" hint="Hours before a pending invitation expires">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="input"
            type="number"
            min={1}
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>h</span>
        </div>
      </FieldRow>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Organization roles</div>
        {/* `owner` é invariante do domínio: sempre preservado. */}
        <ChipsEditor values={roles} onChange={setRoles} locked={['owner']} placeholder="new role…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onSave({ allowSelfCreate, invitationTtlHours: ttlHours, roles })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function RolesCatalogForm({ initial, saving, onSave, onCancel }: {
  initial: RolesCatalogValue
  saving: boolean
  onSave: (value: RolesCatalogValue) => void
  onCancel: () => void
}) {
  const [rows, setRows] = useState(initial.roles.map((r) => ({ name: r.name, description: r.description ?? '' })))
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  function addRow() {
    const name = newName.trim().toUpperCase()
    if (!name || rows.some((r) => r.name === name)) return
    setRows([...rows, { name, description: newDesc.trim() }])
    setNewName(''); setNewDesc('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => (
        <div key={row.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="badge badge-muted" style={{ minWidth: 70, justifyContent: 'center' }}>{row.name}</span>
          <input
            className="input"
            value={row.description}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
            placeholder="description…"
            style={{ flex: 1 }}
          />
          {/* ADMIN é o gate do console — o backend o garante de qualquer forma. */}
          {row.name !== 'ADMIN' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger, #e53e3e)' }}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
          placeholder="ROLE_NAME"
          style={{ width: 130 }}
        />
        <input
          className="input"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
          placeholder="description…"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>Add</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onSave({ roles: rows.map((r) => ({ name: r.name, description: r.description || undefined })) })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
