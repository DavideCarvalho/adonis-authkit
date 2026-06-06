import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useSessionsQueryOptions,
  useRevokeAllSessionsMutationOptions,
  authkitKeys,
} from '@dudousxd/adonis-authkit-react'
import { Pagination } from '../components/Pagination'
import { useToast } from '../lib/toast'

const PER_PAGE = 20

export function Sessions() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery(useSessionsQueryOptions())
  const allSessions = data?.sessions ?? []
  const total = allSessions.length

  // Client-side pagination
  const sessions = allSessions.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const revokeMutation = useMutation(useRevokeAllSessionsMutationOptions())

  async function revokeAll() {
    if (!confirm('Revoke ALL active sessions? All users will be logged out.')) return
    try {
      const r = await revokeMutation.mutateAsync()
      toast.success(`Revoked ${r.revoked ?? 0} sessions`)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.sessions() })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
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
          <button className="btn btn-danger" onClick={revokeAll} disabled={revokeMutation.isPending}>
            {revokeMutation.isPending ? <span className="spinner sm" /> : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            )}
            Revoke All
          </button>
        </div>
      </div>

      <div className="panel">
        {isLoading ? (
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
              <Pagination page={page} total={total} perPage={PER_PAGE} onPage={setPage} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
