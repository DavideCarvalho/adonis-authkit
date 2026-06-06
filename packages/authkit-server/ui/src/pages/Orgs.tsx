import React, { useEffect, useState, useCallback } from 'react'
import { api, type Org, type OrgDetail } from '../lib/api'
import { Pagination } from '../components/Pagination'
import { Drawer } from '../components/Drawer'
import { useToast } from '../lib/toast'

export function Orgs() {
  const toast = useToast()
  const [orgs, setOrgs] = useState<Org[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.orgs
      .list({ search, page, perPage: 20 })
      .then((r) => { setOrgs(r.data); setTotal(r.total) })
      .catch((e) => {
        if (e.status === 404) setUnavailable(true)
        else toast.error(e.message)
      })
      .finally(() => setLoading(false))
  }, [search, page])

  useEffect(() => { load() }, [load])

  function openDetail(o: Org) {
    setDetail(null)
    setDetailLoading(true)
    api.orgs
      .get(o.id)
      .then(setDetail)
      .catch((e) => toast.error(e.message))
      .finally(() => setDetailLoading(false))
  }

  if (unavailable) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>Organizations</div>
        <div className="error-box">Organizations are not enabled in this AuthKit installation.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Organizations</div>
          <div className="page-sub">{total.toLocaleString()} orgs</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="search-input" style={{ flex: 1, maxWidth: 300 }}>
            <svg className="search-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="7" cy="7" r="4.5" /><path d="M10 10l3 3" strokeLinecap="round" />
            </svg>
            <input
              className="input"
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        {loading ? (
          <div className="loading-row"><div className="spinner" /></div>
        ) : orgs.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <path d="M17.5 14v7M14 17.5h7" strokeLinecap="round" />
            </svg>
            <h4>No organizations</h4>
            <p>{search ? 'No results for your search' : 'No organizations created yet'}</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Members</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} onClick={() => openDetail(o)}>
                    <td><b>{o.name}</b></td>
                    <td><span className="code">{o.slug}</span></td>
                    <td><span className="mono text-sm">{o.memberCount ?? '—'}</span></td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--faint)' }}>
                        {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
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

      <Drawer
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Loading…'}
      >
        {detailLoading && <div className="loading-row"><div className="spinner" /></div>}
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
                Info
              </div>
              <div className="code">{detail.id}</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <span className="badge badge-muted">{detail.slug}</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
                Members ({detail.members.length})
              </div>
              {detail.members.map((m) => (
                <div key={m.accountId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>
                    {(m.email ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{m.email ?? m.accountId}</div>
                  </div>
                  <span className="badge badge-muted">{m.role}</span>
                </div>
              ))}
            </div>

            {detail.invitations.length > 0 && (
              <div>
                <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
                  Pending Invitations ({detail.invitations.length})
                </div>
                {detail.invitations.map((inv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{inv.email}</div>
                    <span className="badge badge-amber">{inv.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
