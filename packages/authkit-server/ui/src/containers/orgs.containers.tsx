import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useOrgsQueryOptions, useOrgQueryOptions } from '@dudousxd/adonis-authkit-react'
import { Drawer } from '../components/Drawer'
import { Pagination } from '../components/Pagination'
import { QueryBoundary } from '../components/QueryBoundary'
import { SkeletonPanelTable, SkeletonDrawerSection } from '../components/Skeleton'

const PER_PAGE = 20

// ── OrgsTableContainer ────────────────────────────────────────────────────────

interface OrgsTableContainerProps {
  search: string
  page: number
  onPage: (p: number) => void
  onSelectOrg: (id: string) => void
  onUnavailable: () => void
}

export function OrgsTableContainer({ search, page, onPage, onSelectOrg, onUnavailable }: OrgsTableContainerProps) {
  const [checkedUnavailable, setCheckedUnavailable] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    ...useOrgsQueryOptions(),
    retry: (failureCount, err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) {
        if (!checkedUnavailable) {
          setCheckedUnavailable(true)
          onUnavailable()
        }
        return false
      }
      return failureCount < 1
    },
  })

  const allOrgs = data?.data ?? []
  const filtered = search
    ? allOrgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.slug.toLowerCase().includes(search.toLowerCase())
      )
    : allOrgs
  const total = filtered.length
  const orgs = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  // Determine if it's a 404 (unavailable) or a real error
  const isNotFound = error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404
  const displayError = error && !isNotFound ? error : undefined

  return (
    <div className="panel">
      <QueryBoundary
        isLoading={isLoading}
        error={displayError}
        onRetry={refetch}
        skeleton={<SkeletonPanelTable rows={6} cols={4} />}
      >
        {orgs.length === 0 ? (
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
                  <tr key={o.id} onClick={() => onSelectOrg(o.id)}>
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
              <Pagination page={page} total={total} perPage={PER_PAGE} onPage={onPage} />
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  )
}

// ── OrgDetailContainer ────────────────────────────────────────────────────────

interface OrgDetailContainerProps {
  orgId: string
}

function OrgDetailContent({ orgId }: OrgDetailContainerProps) {
  const { data: detail, isLoading, error, refetch } = useQuery(useOrgQueryOptions(orgId))

  return (
    <QueryBoundary
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<SkeletonDrawerSection />}
    >
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

          {detail.pendingInvitations.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8 }}>
                Pending Invitations ({detail.pendingInvitations.length})
              </div>
              {detail.pendingInvitations.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{inv.email}</div>
                  <span className="badge badge-amber">{inv.role}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </QueryBoundary>
  )
}

// ── OrgDetailDrawer ───────────────────────────────────────────────────────────

interface OrgDetailDrawerProps {
  orgId: string
  onClose: () => void
}

export function OrgDetailDrawer({ orgId, onClose }: OrgDetailDrawerProps) {
  const { data: detail } = useQuery(useOrgQueryOptions(orgId))

  return (
    <Drawer open={true} onClose={onClose} title={detail?.name ?? 'Organization'}>
      <OrgDetailContent orgId={orgId} />
    </Drawer>
  )
}

// Re-export count for page header
export function useOrgsTotal(search: string) {
  const { data } = useQuery(useOrgsQueryOptions())
  const allOrgs = data?.data ?? []
  const filtered = search
    ? allOrgs.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.slug.toLowerCase().includes(search.toLowerCase())
      )
    : allOrgs
  return filtered.length
}
