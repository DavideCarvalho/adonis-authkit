import React, { useState } from 'react'
import { AuditTableContainer, AuditEventDetailContainer } from '../containers/audit.containers'
import type { AuditEventEntry } from '@dudousxd/adonis-authkit-react'

const EVENT_TYPES = [
  '',
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
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected] = useState<AuditEventEntry | null>(null)
  const [unavailable, setUnavailable] = useState(false)

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
        </div>
      </div>

      {/* Filter bar */}
      <div className="panel" style={{ marginBottom: 0 }}>
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
      </div>

      <AuditTableContainer
        typeFilter={typeFilter}
        page={page}
        onPage={setPage}
        selected={selected}
        onSelect={setSelected}
        onUnavailable={() => setUnavailable(true)}
      />

      {selected && (
        <div style={{ marginTop: 12 }}>
          <AuditEventDetailContainer event={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  )
}
