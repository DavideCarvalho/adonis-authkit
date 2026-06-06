import React, { useEffect, useState, useCallback } from 'react'
import { api, type Session } from '../lib/api'
import { ApiError } from '../lib/api'
import { Pagination } from '../components/Pagination'
import { useToast } from '../lib/toast'

export function Sessions() {
  const toast = useToast()
  const [sessions, setSessions] = useState<Session[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.sessions
      .list({ page, perPage: 20 })
      .then((r) => { setSessions(r.data); setTotal(r.total) })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  async function revokeAll() {
    if (!confirm('Revoke ALL active sessions? All users will be logged out.')) return
    setRevoking(true)
    try {
      const r = await api.sessions.revokeAll()
      toast.success(`Revoked ${r.revoked} sessions`)
      load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : String(err))
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Sessions</div>
          <div className="page-sub">{total.toLocaleString()} active sessions</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-danger" onClick={revokeAll} disabled={revoking}>
            {revoking ? <span className="spinner sm" /> : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            )}
            Revoke All
          </button>
        </div>
      </div>

      <div className="panel">
        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <h4>No active sessions</h4>
            <p>No users are currently logged in</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Browser / OS</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Login</th>
                  <th>Methods</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={{ cursor: 'default' }}>
                    <td>
                      <span className="mono text-sm">{s.accountId}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: 12 }}>{s.browser ?? '—'}</span>
                        <span style={{ color: 'var(--faint)', fontSize: 11 }}>{s.os ?? ''}</span>
                      </div>
                    </td>
                    <td><span className="code">{s.ip ?? '—'}</span></td>
                    <td><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.location ?? '—'}</span></td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
                        {s.loginTs ? new Date(s.loginTs).toLocaleString() : '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.amr.length === 0 ? (
                          <span className="badge badge-muted">—</span>
                        ) : s.amr.map((m) => (
                          <span key={m} className="badge badge-muted">{m}</span>
                        ))}
                      </div>
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
    </div>
  )
}
