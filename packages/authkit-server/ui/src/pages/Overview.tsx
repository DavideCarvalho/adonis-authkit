import React, { useEffect, useState } from 'react'
import { api, type OverviewData } from '../lib/api'
import { SparkLine } from '../components/SparkLine'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function eventBadgeClass(type: string) {
  if (type.includes('login') || type.includes('signin')) return 'badge-green'
  if (type.includes('fail') || type.includes('error') || type.includes('locked')) return 'badge-red'
  if (type.includes('register') || type.includes('signup')) return 'badge-accent'
  if (type.includes('settings') || type.includes('admin')) return 'badge-amber'
  return 'badge-muted'
}

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.overview
      .get()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="loading-row">
        <div className="spinner lg" />
        <span>Loading overview…</span>
      </div>
    )
  }

  if (error) {
    return <div className="error-box">{error}</div>
  }

  if (!data) return null

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Overview</div>
        <div className="page-sub">Identity provider metrics · last {data.windowDays} days</div>
      </div>

      <div className="cards">
        <div className="card c-accent">
          <div className="card-label">Total Users</div>
          <div className="card-value">{data.usersTotal.toLocaleString()}</div>
          <div className="card-hint">registered accounts</div>
        </div>
        <div className="card c-green">
          <div className="card-label">Active Sessions</div>
          <div className="card-value">{data.activeSessions.toLocaleString()}</div>
          <div className="card-hint">currently logged in</div>
        </div>
        <div className="card c-amber">
          <div className="card-label">MAU</div>
          <div className="card-value">{data.mau.toLocaleString()}</div>
          <div className="card-hint">monthly active users</div>
        </div>
        <div className="card">
          <div className="card-label">Sign-ins</div>
          <div className="card-value" style={{ color: 'var(--text)' }}>{data.signInsTotal.toLocaleString()}</div>
          <div className="card-hint">last {data.windowDays} days</div>
        </div>
        <div className="card c-blue">
          <div className="card-label">Sign-ups</div>
          <div className="card-value">{data.signUpsTotal.toLocaleString()}</div>
          <div className="card-hint">new registrations</div>
        </div>
        <div className="card">
          <div className="card-label">OAuth Clients</div>
          <div className="card-value" style={{ color: 'var(--text)' }}>{data.clientsCount.toLocaleString()}</div>
          <div className="card-hint">OIDC clients</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h3>Sign-ins / day</h3>
            <span className="meta">last {data.windowDays}d</span>
          </div>
          <div className="panel-body" style={{ paddingBottom: '4px' }}>
            {data.signInsPerDay.length > 0 ? (
              <SparkLine data={data.signInsPerDay} color="var(--accent)" />
            ) : (
              <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: 12 }}>
                No data yet
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Sign-ups / day</h3>
            <span className="meta">last {data.windowDays}d</span>
          </div>
          <div className="panel-body" style={{ paddingBottom: '4px' }}>
            {data.signUpsPerDay.length > 0 ? (
              <SparkLine data={data.signUpsPerDay} color="var(--green)" />
            ) : (
              <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: 12 }}>
                No data yet
              </div>
            )}
          </div>
        </div>
      </div>

      {data.auditSupported && data.recentEvents.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Recent Events</h3>
            <span className="meta">{data.auditTotal.toLocaleString()} total</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
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
                {data.recentEvents.map((ev) => (
                  <tr key={ev.id} className="static" style={{ cursor: 'default' }}>
                    <td>
                      <span className={`badge ${eventBadgeClass(ev.type)}`}>{ev.type}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11.5px' }}>
                        {ev.email ?? ev.accountId ?? '—'}
                      </span>
                    </td>
                    <td>
                      <span className="code">{ev.ip ?? '—'}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--faint)' }}>
                        {ev.createdAt ? fmtDate(ev.createdAt) : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
