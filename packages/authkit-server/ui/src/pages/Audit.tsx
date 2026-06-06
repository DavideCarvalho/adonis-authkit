import React, { useEffect, useState, useCallback } from 'react'
import { api, type AuditEvent } from '../lib/api'
import { Pagination } from '../components/Pagination'
import { useToast } from '../lib/toast'

function eventBadgeClass(type: string) {
  if (type.includes('login') || type.includes('signin') || type.includes('success')) return 'badge-green'
  if (type.includes('fail') || type.includes('error') || type.includes('locked') || type.includes('block')) return 'badge-red'
  if (type.includes('register') || type.includes('signup') || type.includes('created')) return 'badge-accent'
  if (type.includes('settings') || type.includes('admin') || type.includes('updated')) return 'badge-amber'
  if (type.includes('logout') || type.includes('revoke') || type.includes('deleted')) return 'badge-muted'
  return 'badge-muted'
}

const EVENT_TYPES = [
  '', // all
  'login.success',
  'login.failed',
  'login.mfa_required',
  'logout',
  'register',
  'password_reset',
  'settings.updated',
  'client.created',
  'client.deleted',
  'account.disabled',
  'account.enabled',
]

export function Audit() {
  const toast = useToast()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState<AuditEvent | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.audit
      .list({ type: typeFilter || undefined, page, perPage: 30 })
      .then((r) => { setEvents(r.data); setTotal(r.total) })
      .catch((e) => {
        if (e.status === 404) setUnavailable(true)
        else toast.error(e.message)
      })
      .finally(() => setLoading(false))
  }, [typeFilter, page])

  useEffect(() => { load() }, [load])

  if (unavailable) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>Audit Log</div>
        <div className="error-box">Audit log is not configured. Add an audit sink to your AuthKit config.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Audit Log</div>
          <div className="page-sub">{total.toLocaleString()} events</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <select
            className="input"
            style={{ width: 240 }}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t || 'All event types'}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" />
            </svg>
            <h4>No events found</h4>
            <p>{typeFilter ? 'No events match this filter' : 'No audit events recorded yet'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Account</th>
                  <th>IP</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} onClick={() => setSelected(selected?.id === ev.id ? null : ev)}>
                    <td>
                      <span className={`badge ${eventBadgeClass(ev.type)}`}>{ev.type}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                        {ev.email ?? ev.accountId ?? <span style={{ color: 'var(--faint)' }}>—</span>}
                      </span>
                    </td>
                    <td><span className="code">{ev.ip ?? '—'}</span></td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
                        {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0 16px 12px' }}>
              <Pagination page={page} total={total} perPage={30} onPage={setPage} />
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Event Detail</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <pre style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted)', overflow: 'auto', lineHeight: 1.6 }}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
