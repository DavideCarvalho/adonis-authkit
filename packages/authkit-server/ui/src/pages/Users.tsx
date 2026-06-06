import React, { useEffect, useState, useCallback } from 'react'
import { api, type User, type UserDetail } from '../lib/api'
import { ApiError } from '../lib/api'
import { Modal } from '../components/Modal'
import { Drawer } from '../components/Drawer'
import { Pagination } from '../components/Pagination'
import { useToast } from '../lib/toast'

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function Users() {
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search, 300)
  const [loading, setLoading] = useState(true)

  const [createOpen, setCreateOpen] = useState(false)
  const [detailUser, setDetailUser] = useState<UserDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', invite: false })
  const [createLoading, setCreateLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.users
      .list({ search: dSearch, page, perPage: 20 })
      .then((r) => { setUsers(r.data); setTotal(r.total) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [dSearch, page])

  useEffect(() => { load() }, [load])

  function openDetail(u: User) {
    setDetailUser(null)
    setDetailLoading(true)
    api.users
      .get(u.id)
      .then(setDetailUser)
      .catch((e) => toast.error(e.message))
      .finally(() => setDetailLoading(false))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateLoading(true)
    try {
      await api.users.create({
        email: createForm.email,
        name: createForm.name || undefined,
        password: createForm.password || undefined,
        invite: createForm.invite,
      })
      toast.success('User created')
      setCreateOpen(false)
      setCreateForm({ email: '', name: '', password: '', invite: false })
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleToggleDisable(u: UserDetail) {
    try {
      const updated = u.disabled ? await api.users.enable(u.id) : await api.users.disable(u.id)
      toast.success(u.disabled ? 'User enabled' : 'User disabled')
      setDetailUser((d) => d ? { ...d, disabled: updated.disabled } : d)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleResetPassword(u: UserDetail) {
    try {
      const r = await api.users.resetPassword(u.id)
      toast.success(`Reset email sent to ${r.email}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleDelete(u: UserDetail) {
    if (!confirm(`Delete user ${u.email}? This cannot be undone.`)) return
    try {
      await api.users.delete(u.id)
      toast.success('User deleted')
      setDetailUser(null)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleUpdateRoles(u: UserDetail, roles: string[]) {
    try {
      const updated = await api.users.updateRoles(u.id, roles)
      toast.success('Roles updated')
      setDetailUser((d) => d ? { ...d, globalRoles: updated.globalRoles } : d)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    }
  }

  async function handleImpersonate(u: UserDetail) {
    try {
      const r = await api.impersonation.get(u.id)
      window.open(r.url, '_blank')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Impersonation not available')
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Users</div>
          <div className="page-sub">{total.toLocaleString()} accounts</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 2v12M2 8h12" strokeLinecap="round" />
            </svg>
            New User
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="search-input" style={{ flex: 1, maxWidth: 320 }}>
            <svg className="search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10 10l3 3" strokeLinecap="round" />
            </svg>
            <input
              className="input"
              placeholder="Search by email or name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : users.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.42 3.58-8 8-8s8 3.58 8 8" />
            </svg>
            <h4>No users found</h4>
            <p>{search ? 'Try a different search term' : 'No accounts registered yet'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Roles</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} onClick={() => openDetail(u)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                          {u.email.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ color: 'var(--text)', fontWeight: 500, fontSize: 12.5 }}>{u.email}</div>
                          {u.name && <div style={{ color: 'var(--faint)', fontSize: 11 }}>{u.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {u.globalRoles.length === 0 ? (
                          <span className="badge badge-muted">no roles</span>
                        ) : u.globalRoles.map((r) => (
                          <span key={r} className="badge badge-accent">{r}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${u.disabled ? 'badge-red' : 'badge-green'}`}>
                        {u.disabled ? 'disabled' : 'active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={page} total={total} perPage={20} onPage={setPage} />
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create User"
        footer={
          <>
            <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={createLoading}>
              {createLoading ? <span className="spinner sm" /> : 'Create User'}
            </button>
          </>
        }
      >
        <form onSubmit={handleCreate}>
          <div className="field">
            <label>Email *</label>
            <input
              className="input"
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com"
            />
          </div>
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name (optional)"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              className="input"
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Leave blank to send invite"
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={createForm.invite}
              onChange={(e) => setCreateForm((f) => ({ ...f, invite: e.target.checked }))}
            />
            <span className="chk-label">Send invitation email</span>
          </label>
        </form>
      </Modal>

      {/* Detail drawer */}
      <Drawer
        open={!!detailUser || detailLoading}
        onClose={() => { setDetailUser(null) }}
        title={detailUser?.email ?? 'Loading…'}
      >
        {detailLoading && <div className="loading-row"><div className="spinner" /></div>}
        {detailUser && (
          <UserDetailPanel
            user={detailUser}
            onToggleDisable={handleToggleDisable}
            onResetPassword={handleResetPassword}
            onDelete={handleDelete}
            onUpdateRoles={handleUpdateRoles}
            onImpersonate={handleImpersonate}
          />
        )}
      </Drawer>
    </div>
  )
}

function UserDetailPanel({
  user,
  onToggleDisable,
  onResetPassword,
  onDelete,
  onUpdateRoles,
  onImpersonate,
}: {
  user: UserDetail
  onToggleDisable: (u: UserDetail) => void
  onResetPassword: (u: UserDetail) => void
  onDelete: (u: UserDetail) => void
  onUpdateRoles: (u: UserDetail, roles: string[]) => void
  onImpersonate: (u: UserDetail) => void
}) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(user.globalRoles)

  const toggleRole = (name: string) => {
    setSelectedRoles((prev) =>
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>
            {user.email.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{user.email}</div>
            {user.name && <div style={{ color: 'var(--faint)', fontSize: 12 }}>{user.name}</div>}
            <div style={{ marginTop: 4 }}>
              <span className={`badge ${user.disabled ? 'badge-red' : 'badge-green'}`}>
                {user.disabled ? 'disabled' : 'active'}
              </span>
            </div>
          </div>
        </div>

        <div className="code" style={{ fontSize: 11, padding: '6px 10px' }}>ID: {user.id}</div>
      </div>

      {/* Actions */}
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {user.statusSupported && (
            <button
              className={`btn btn-sm ${user.disabled ? '' : 'btn-danger'}`}
              onClick={() => onToggleDisable(user)}
            >
              {user.disabled ? 'Enable account' : 'Disable account'}
            </button>
          )}
          <button className="btn btn-sm" onClick={() => onResetPassword(user)}>
            Reset password
          </button>
          <button className="btn btn-sm" onClick={() => onImpersonate(user)}>
            Impersonate
          </button>
          {user.deletionSupported && (
            <button className="btn btn-sm btn-danger" onClick={() => onDelete(user)}>
              Delete user
            </button>
          )}
        </div>
      </div>

      {/* Roles */}
      {user.catalogRoles.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
            Global Roles
          </div>
          {user.catalogRoles.map((r) => (
            <label key={r.name} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedRoles.includes(r.name)}
                onChange={() => toggleRole(r.name)}
              />
              <div>
                <div className="chk-label">{r.name}</div>
                {r.description && <div style={{ fontSize: 11, color: 'var(--faint)' }}>{r.description}</div>}
              </div>
            </label>
          ))}
          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => onUpdateRoles(user, selectedRoles)}
          >
            Save roles
          </button>
        </div>
      )}

      {/* Sessions */}
      {user.sessionsSupported && (
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
            Sessions ({user.sessions.length})
          </div>
          {user.sessions.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--faint)' }}>No active sessions</div>
          ) : (
            user.sessions.map((s) => (
              <div key={s.id} className="panel" style={{ marginBottom: 8, padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.6">
                    <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
                    <circle cx="8" cy="8.5" r="2" />
                  </svg>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{s.browser ?? 'Unknown browser'}</span>
                  <span style={{ color: 'var(--faint)' }}>{s.os}</span>
                  <span className="code ml-auto">{s.ip ?? '—'}</span>
                </div>
                {s.location && <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>{s.location}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
