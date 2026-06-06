import React, { useEffect, useState, useCallback } from 'react'
import { api, type Role, ApiError } from '../lib/api'
import { Modal } from '../components/Modal'
import { useToast } from '../lib/toast'

const PROTECTED = 'ADMIN'

export function Roles() {
  const toast = useToast()
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editRole, setEditRole] = useState<Role | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.roles
      .list()
      .then((r) => setRoles(r.data))
      .catch((e) => {
        if (e.status === 404) setUnavailable(true)
        else toast.error(e.message)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.roles.create({ name: form.name.trim().toUpperCase(), description: form.description || undefined })
      toast.success('Role created')
      setCreateOpen(false)
      setForm({ name: '', description: '' })
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editRole) return
    setSaving(true)
    try {
      await api.roles.update(editRole.name, { description: form.description || undefined })
      toast.success('Role updated')
      setEditRole(null)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(r: Role) {
    if (r.name === PROTECTED) return
    if (!confirm(`Delete role ${r.name}?`)) return
    try {
      await api.roles.delete(r.name)
      toast.success('Role deleted')
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  if (unavailable) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>Roles</div>
        <div className="error-box">
          Role catalog requires the <code>auth_settings</code> table (runtime settings). Run the migration to enable this feature.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Roles</div>
          <div className="page-sub">Global role catalog</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', description: '' }); setCreateOpen(true) }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 2v12M2 8h12" strokeLinecap="round" />
            </svg>
            New Role
          </button>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : roles.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M2 20a10 10 0 0120 0" />
            </svg>
            <h4>No roles yet</h4>
            <p>Create roles to assign permissions to users</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.name} style={{ cursor: 'default' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: r.name === PROTECTED ? 'var(--accent)' : 'var(--text)' }}>
                        {r.name}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description ?? '—'}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.builtin ? 'badge-accent' : 'badge-muted'}`}>
                        {r.builtin ? 'built-in' : 'custom'}
                      </span>
                    </td>
                    <td className="no-click" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => { setEditRole(r); setForm({ name: r.name, description: r.description ?? '' }) }}
                        >
                          Edit
                        </button>
                        {r.name !== PROTECTED && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleDelete(r)}>
                            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M2 4.5h12M5.5 4.5V3h5v1.5M10.5 4.5v8a1 1 0 01-1 1h-3a1 1 0 01-1-1v-8" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Role"
        footer={
          <>
            <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
              {saving ? <span className="spinner sm" /> : 'Create Role'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Name * (uppercase)</label>
            <input
              className="input input-mono"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
              placeholder="EDITOR"
            />
            <div className="hint">Letters, digits, underscore. E.g. ADMIN, CONTENT_MANAGER</div>
          </div>
          <div className="field">
            <label>Description</label>
            <input
              className="input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Can edit content"
            />
          </div>
        </form>
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editRole}
        onClose={() => setEditRole(null)}
        title={`Edit Role — ${editRole?.name}`}
        footer={
          <>
            <button className="btn" onClick={() => setEditRole(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpdate} disabled={saving}>
              {saving ? <span className="spinner sm" /> : 'Save'}
            </button>
          </>
        }
      >
        <div className="field">
          <label>Description</label>
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  )
}
