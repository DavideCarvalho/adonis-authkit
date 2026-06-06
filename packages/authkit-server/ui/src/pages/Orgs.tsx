import React, { useState, useEffect } from 'react'
import { useToast } from '../lib/toast'
import { OrgsTableContainer, OrgDetailDrawer, useOrgsTotal } from '../containers/orgs.containers'

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function Orgs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const dSearch = useDebounce(search, 300)
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const total = useOrgsTotal(dSearch)

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

      <div className="panel" style={{ marginBottom: 0 }}>
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
      </div>

      <OrgsTableContainer
        search={dSearch}
        page={page}
        onPage={setPage}
        onSelectOrg={setDetailOrgId}
        onUnavailable={() => setUnavailable(true)}
      />

      {detailOrgId && (
        <OrgDetailDrawer orgId={detailOrgId} onClose={() => setDetailOrgId(null)} />
      )}
    </div>
  )
}
