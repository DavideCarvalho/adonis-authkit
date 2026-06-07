import React, { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useOrgsQueryOptions,
  useUsersQueryOptions,
  useOrgQueryOptions,
  useCreateOrgMutationOptions,
  useUpdateOrgMutationOptions,
  useDeleteOrgMutationOptions,
  useAddOrgMemberMutationOptions,
  useRemoveOrgMemberMutationOptions,
  useUpdateOrgMemberRoleMutationOptions,
  useCreateOrgInvitationMutationOptions,
  useRevokeOrgInvitationMutationOptions,
  useSettingsQueryOptions,
  useSetSettingMutationOptions,
  useRemoveSettingMutationOptions,
  authkitKeys,
} from '@dudousxd/adonis-authkit-react'
import { Drawer } from '../components/Drawer'
import { Pagination } from '../components/Pagination'
import { QueryBoundary } from '../components/QueryBoundary'
import { SkeletonPanelTable, SkeletonDrawerSection } from '../components/Skeleton'
import { useToast } from '../lib/toast'

const PER_PAGE = 20

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}


// ── UserPicker ────────────────────────────────────────────────────────────────

interface PickedUser {
  id: string
  email: string
  name?: string | null
}

/** Busca de usuário por email/nome com dropdown — substitui campos de UUID cru. */
function UserPicker({ onPick, placeholder }: { onPick: (u: PickedUser) => void; placeholder?: string }) {
  const [search, setSearch] = useState('')
  const dSearch = useDebouncedValue(search, 250)
  const usersQuery = useQuery({
    ...useUsersQueryOptions({ search: dSearch, limit: 6 }),
    enabled: dSearch.trim().length >= 2,
  })
  const candidates = usersQuery.data?.data ?? []

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder ?? 'Search user by email or name…'}
        autoFocus
      />
      {dSearch.trim().length >= 2 && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
            background: 'var(--panel, var(--bg))', border: '1px solid var(--line)',
            borderRadius: 6, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          {usersQuery.isLoading ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--faint)' }}>Searching…</div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--faint)' }}>No users match.</div>
          ) : (
            candidates.map((u: any) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onPick({ id: u.id, email: u.email, name: u.name ?? u.fullName ?? null })}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 12.5,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--line)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontWeight: 600 }}>{u.name ?? u.fullName ?? u.email}</span>
                {(u.name ?? u.fullName) && (
                  <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{u.email}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Chip do usuário escolhido, com X pra trocar. */
function PickedUserChip({ user, onClear }: { user: PickedUser; onClear: () => void }) {
  return (
    <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {user.name ? `${user.name} · ` : ''}{user.email}
      <button
        type="button"
        onClick={onClear}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
        aria-label="Clear selected user"
      >
        ×
      </button>
    </span>
  )
}

// ── CreateOrgModal ────────────────────────────────────────────────────────────

interface CreateOrgModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateOrgModal({ open, onClose, onCreated }: CreateOrgModalProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [owner, setOwner] = useState<PickedUser | null>(null)

  const createMutation = useMutation(useCreateOrgMutationOptions())

  function handleNameChange(v: string) {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim() || !owner) return
    try {
      await createMutation.mutateAsync({ name: name.trim(), slug: slug.trim(), ownerAccountId: owner.id })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.orgs() })
      toast.success('Organization created')
      setName(''); setSlug(''); setOwner(null); setSlugTouched(false)
      onCreated()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create organization')
    }
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>New Organization</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Inc."
              required
            />
          </div>
          <div>
            <label className="field-label">Slug</label>
            <input
              className="input"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true) }}
              placeholder="acme-inc"
              required
            />
          </div>
          <div>
            <label className="field-label">Owner</label>
            {owner ? (
              <PickedUserChip user={owner} onClear={() => setOwner(null)} />
            ) : (
              <UserPicker onPick={setOwner} placeholder="Search the initial owner by email…" />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── OrgsTableContainer ────────────────────────────────────────────────────────

interface OrgsTableContainerProps {
  search: string
  page: number
  onPage: (p: number) => void
  onSelectOrg: (id: string) => void
  onUnavailable: () => void
  onCreateClick: () => void
}

export function OrgsTableContainer({ search, page, onPage, onSelectOrg, onUnavailable, onCreateClick }: OrgsTableContainerProps) {
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
            {!search && (
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onCreateClick}>
                New organization
              </button>
            )}
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

// ── EditOrgSection ────────────────────────────────────────────────────────────

interface EditOrgSectionProps {
  orgId: string
  currentName: string
  currentLogoUrl: string | null
  onDone: () => void
}

function EditOrgSection({ orgId, currentName, currentLogoUrl, onDone }: EditOrgSectionProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState(currentName)
  const [logoUrl, setLogoUrl] = useState(currentLogoUrl ?? '')

  const updateMutation = useMutation(useUpdateOrgMutationOptions(orgId))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await updateMutation.mutateAsync({ name: name.trim() || undefined, logoUrl: logoUrl.trim() || null })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.orgs() })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      toast.success('Organization updated')
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update organization')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label className="field-label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="field-label">Logo URL</label>
        <input className="input" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

// ── AddMemberSection ──────────────────────────────────────────────────────────

interface AddMemberSectionProps {
  orgId: string
  onDone: () => void
}

/** Roles de organização oferecidos nos selects (espelha o default da lib). */
const DEFAULT_ORG_ROLES = ['owner', 'admin', 'member']

function OrgRoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const roles = DEFAULT_ORG_ROLES.includes(value) ? DEFAULT_ORG_ROLES : [...DEFAULT_ORG_ROLES, value]
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 110 }}>
      {roles.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  )
}

function AddMemberSection({ orgId, onDone }: AddMemberSectionProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<PickedUser | null>(null)
  const [role, setRole] = useState('member')

  const addMutation = useMutation(useAddOrgMemberMutationOptions(orgId))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) return
    try {
      await addMutation.mutateAsync({ accountId: picked.id, role })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.orgs() })
      toast.success(`${picked.email} added as ${role}`)
      onDone()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to add member')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {picked ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PickedUserChip user={picked} onClear={() => setPicked(null)} />
          <OrgRoleSelect value={role} onChange={setRole} />
          <button type="submit" className="btn btn-primary btn-sm" disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add member'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
        </div>
      ) : (
        <div>
          <UserPicker onPick={setPicked} />
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
          </div>
        </div>
      )}
    </form>
  )
}

// ── InviteSection ─────────────────────────────────────────────────────────────

interface InviteSectionProps {
  orgId: string
  onDone: () => void
}

function InviteSection({ orgId, onDone }: InviteSectionProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')

  const inviteMutation = useMutation(useCreateOrgInvitationMutationOptions(orgId))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      toast.success('Invitation sent')
      setEmail(''); onDone()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create invitation')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <label className="field-label">Email</label>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          required
        />
      </div>
      <div>
        <label className="field-label">Role</label>
        <OrgRoleSelect value={role} onChange={setRole} />
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={inviteMutation.isPending}>
        {inviteMutation.isPending ? 'Sending…' : 'Invite'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
    </form>
  )
}

// ── OrgDetailContent ──────────────────────────────────────────────────────────

interface OrgDetailContentProps {
  orgId: string
  onDeleted: () => void
}

function OrgDetailContent({ orgId, onDeleted }: OrgDetailContentProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { data: detail, isLoading, error, refetch } = useQuery(useOrgQueryOptions(orgId))
  const [editing, setEditing] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMutation = useMutation(useDeleteOrgMutationOptions(orgId))

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync()
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.orgs() })
      toast.success('Organization deleted')
      onDeleted()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete organization')
    }
  }

  return (
    <QueryBoundary
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      skeleton={<SkeletonDrawerSection />}
    >
      {detail && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Info / Edit ── */}
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Info</span>
              {!editing && (
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
              )}
            </div>
            {editing ? (
              <EditOrgSection
                orgId={orgId}
                currentName={detail.name}
                currentLogoUrl={detail.logoUrl}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="code">{detail.id}</div>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  <span className="badge badge-muted">{detail.slug}</span>
                </div>
              </>
            )}
          </div>

          {/* ── Members ── */}
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Members ({detail.members.length})</span>
              {!addingMember && (
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingMember(true)}>+ Add</button>
              )}
            </div>
            {addingMember && (
              <div style={{ marginBottom: 10 }}>
                <AddMemberSection orgId={orgId} onDone={() => setAddingMember(false)} />
              </div>
            )}
            {detail.members.map((m) => (
              <MemberRow key={m.accountId} orgId={orgId} member={m} />
            ))}
          </div>

          {/* ── Pending Invitations ── */}
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Pending Invitations ({detail.pendingInvitations.length})</span>
              {!inviting && (
                <button className="btn btn-ghost btn-sm" onClick={() => setInviting(true)}>+ Invite</button>
              )}
            </div>
            {inviting && (
              <div style={{ marginBottom: 10 }}>
                <InviteSection orgId={orgId} onDone={() => setInviting(false)} />
              </div>
            )}
            {detail.pendingInvitations.length === 0 && !inviting && (
              <div style={{ fontSize: 12, color: 'var(--faint)' }}>No pending invitations</div>
            )}
            {detail.pendingInvitations.map((inv) => (
              <InvitationRow key={inv.id} orgId={orgId} invitation={inv} />
            ))}
          </div>

          {/* ── Organization Settings ── */}
          <OrgSettingsSection orgId={orgId} />

          {/* ── Danger Zone ── */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--danger, #e53e3e)', fontWeight: 600, marginBottom: 8 }}>
              Danger Zone
            </div>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: 'var(--muted)' }}>Delete this organization?</span>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                Delete organization
              </button>
            )}
          </div>
        </div>
      )}
    </QueryBoundary>
  )
}

// ── OrgSettingsSection ────────────────────────────────────────────────────────

/**
 * Keys de settings que fazem sentido por organização.
 * As demais (bot_protection, lockout, rate_limit, etc.) são GLOBAIS
 * e permanecem somente na página global de Settings.
 */
const ORG_SCOPABLE_KEYS = ['organizations_policy', 'roles_catalog'] as const

type OrgScopableKey = (typeof ORG_SCOPABLE_KEYS)[number]

const ORG_SETTING_LABELS: Record<OrgScopableKey, { en: string; pt: string }> = {
  organizations_policy: {
    en: 'Organizations policy',
    pt: 'Política de organizações',
  },
  roles_catalog: {
    en: 'Roles catalog',
    pt: 'Catálogo de papéis',
  },
}

function OrgSettingsSection({ orgId }: { orgId: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: orgSettings, isLoading } = useQuery({ ...useSettingsQueryOptions(orgId), retry: false })
  const { data: globalSettings } = useQuery({ ...useSettingsQueryOptions(null), retry: false })

  const setMutation = useMutation(useSetSettingMutationOptions(orgId))
  const removeMutation = useMutation(useRemoveSettingMutationOptions(orgId))

  const [editingKey, setEditingKey] = useState<OrgScopableKey | null>(null)

  const orgEntries = orgSettings?.data ?? []
  const globalEntries = globalSettings?.data ?? []

  function getOrgEntry(key: OrgScopableKey) {
    return orgEntries.find((e) => e.key === key) ?? null
  }
  function getGlobalEntry(key: OrgScopableKey) {
    return globalEntries.find((e) => e.key === key) ?? null
  }

  async function handleSave(key: OrgScopableKey, value: unknown) {
    try {
      await setMutation.mutateAsync({ key, value })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings(orgId) })
      toast.success('Setting saved for this organization')
      setEditingKey(null)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save setting')
    }
  }

  async function handleRemove(key: OrgScopableKey) {
    try {
      await removeMutation.mutateAsync(key)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.settings(orgId) })
      toast.success('Organization setting removed (falls back to global)')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to remove setting')
    }
  }

  if (isLoading) return null

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', fontWeight: 600, marginBottom: 12 }}>
        Organization Settings
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ORG_SCOPABLE_KEYS.map((key) => {
          const orgEntry = getOrgEntry(key)
          const globalEntry = getGlobalEntry(key)
          const label = ORG_SETTING_LABELS[key]

          // Badge: from org > from global > default
          const sourceBadge = orgEntry
            ? { text: 'from org', color: 'var(--accent, #4f46e5)' }
            : globalEntry
              ? { text: 'from global', color: 'var(--muted)' }
              : { text: 'default', color: 'var(--faint)' }

          const isEditing = editingKey === key
          /** Valor herdado que pré-popula o form quando não há override da org. */
          const inherited = (orgEntry?.value ?? globalEntry?.value ?? null) as any

          return (
            <div key={key} style={{ background: 'var(--surface, var(--bg))', border: '1px solid var(--line)', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isEditing ? 10 : 0 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label.en}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label.pt}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'transparent',
                    border: `1px solid ${sourceBadge.color}`,
                    color: sourceBadge.color,
                    fontWeight: 600,
                  }}
                >
                  {sourceBadge.text}
                </span>
                {!isEditing && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingKey(key)}>
                      {orgEntry ? 'Edit' : 'Override'}
                    </button>
                    {orgEntry && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemove(key)}
                        disabled={removeMutation.isPending}
                        style={{ color: 'var(--danger, #e53e3e)' }}
                        title="Remove org override (falls back to global)"
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </div>

              {!isEditing && <SettingSummary settingKey={key} value={inherited} />}

              {isEditing && key === 'organizations_policy' && (
                <OrgPolicyForm
                  initial={inherited}
                  saving={setMutation.isPending}
                  onSave={(value) => handleSave(key, value)}
                  onCancel={() => setEditingKey(null)}
                />
              )}
              {isEditing && key === 'roles_catalog' && (
                <RolesCatalogForm
                  initial={inherited}
                  saving={setMutation.isPending}
                  onSave={(value) => handleSave(key, value)}
                  onCancel={() => setEditingKey(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Setting forms (estruturados — nada de JSON cru) ──────────────────────────

const ORG_POLICY_DEFAULTS = { allowSelfCreate: false, invitationTtlHours: 168, roles: DEFAULT_ORG_ROLES }

/** Resumo de leitura do valor efetivo, mostrado fora do modo de edição. */
function SettingSummary({ settingKey, value }: { settingKey: OrgScopableKey; value: any }) {
  if (settingKey === 'organizations_policy') {
    const v = { ...ORG_POLICY_DEFAULTS, ...(value ?? {}) }
    return (
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="badge badge-muted">self-create: {v.allowSelfCreate ? 'on' : 'off'}</span>
        <span className="badge badge-muted">invite TTL: {v.invitationTtlHours}h</span>
        {(v.roles ?? []).map((r: string) => (
          <span key={r} className="badge badge-muted">{r}</span>
        ))}
      </div>
    )
  }
  const roles = value?.roles ?? [{ name: 'ADMIN' }]
  return (
    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {roles.map((r: any) => (
        <span key={r.name} className="badge badge-muted" title={r.description ?? ''}>{r.name}</span>
      ))}
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--faint)' }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: checked ? 'var(--accent)' : 'var(--line)', transition: 'background 0.15s',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16,
          borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
        }}
      />
    </button>
  )
}

/** Editor de chips: lista de strings com remover + adicionar. */
function ChipsEditor({ values, onChange, locked = [], placeholder }: {
  values: string[]
  onChange: (v: string[]) => void
  locked?: string[]
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {values.map((v) => (
          <span key={v} className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {v}
            {!locked.includes(v) && (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder ?? 'add…'}
          style={{ maxWidth: 160 }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  )
}

function OrgPolicyForm({ initial, saving, onSave, onCancel }: {
  initial: any
  saving: boolean
  onSave: (value: unknown) => void
  onCancel: () => void
}) {
  const base = { ...ORG_POLICY_DEFAULTS, ...(initial ?? {}) }
  const [allowSelfCreate, setAllowSelfCreate] = useState<boolean>(Boolean(base.allowSelfCreate))
  const [ttlHours, setTtlHours] = useState<number>(Number(base.invitationTtlHours) || 168)
  const [roles, setRoles] = useState<string[]>(Array.isArray(base.roles) && base.roles.length ? base.roles : DEFAULT_ORG_ROLES)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Allow self-create" hint="Members can create their own organizations">
        <Toggle checked={allowSelfCreate} onChange={setAllowSelfCreate} />
      </FieldRow>
      <FieldRow label="Invitation TTL" hint="Hours before a pending invitation expires">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            className="input"
            type="number"
            min={1}
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>h</span>
        </div>
      </FieldRow>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>Organization roles</div>
        {/* `owner` é invariante do domínio: sempre preservado. */}
        <ChipsEditor values={roles} onChange={setRoles} locked={['owner']} placeholder="new role…" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onSave({ allowSelfCreate, invitationTtlHours: ttlHours, roles })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function RolesCatalogForm({ initial, saving, onSave, onCancel }: {
  initial: any
  saving: boolean
  onSave: (value: unknown) => void
  onCancel: () => void
}) {
  const initialRoles: Array<{ name: string; description?: string }> =
    Array.isArray(initial?.roles) && initial.roles.length
      ? initial.roles
      : [{ name: 'ADMIN', description: 'Full access to the admin console' }]
  const [rows, setRows] = useState(initialRoles.map((r) => ({ name: r.name, description: r.description ?? '' })))
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  function addRow() {
    const name = newName.trim().toUpperCase()
    if (!name || rows.some((r) => r.name === name)) return
    setRows([...rows, { name, description: newDesc.trim() }])
    setNewName(''); setNewDesc('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, i) => (
        <div key={row.name} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="badge badge-muted" style={{ minWidth: 70, justifyContent: 'center' }}>{row.name}</span>
          <input
            className="input"
            value={row.description}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
            placeholder="description…"
            style={{ flex: 1 }}
          />
          {/* ADMIN é o gate do console — o backend o garante de qualquer forma. */}
          {row.name !== 'ADMIN' && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger, #e53e3e)' }}
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
          placeholder="ROLE_NAME"
          style={{ width: 130 }}
        />
        <input
          className="input"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
          placeholder="description…"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>Add</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={saving}
          onClick={() => onSave({ roles: rows.map((r) => ({ name: r.name, description: r.description || undefined })) })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ orgId, member }: { orgId: string; member: { accountId: string; email: string | null; role: string; joinedAt: string } }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editingRole, setEditingRole] = useState(false)
  const [newRole, setNewRole] = useState(member.role)

  const removeMutation = useMutation(useRemoveOrgMemberMutationOptions(orgId, member.accountId))
  const roleMutation = useMutation(useUpdateOrgMemberRoleMutationOptions(orgId, member.accountId))

  async function handleRemove() {
    try {
      await removeMutation.mutateAsync()
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.orgs() })
      toast.success('Member removed')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to remove member')
    }
  }

  async function handleRoleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await roleMutation.mutateAsync(newRole)
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      toast.success('Role updated')
      setEditingRole(false)
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update role')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>
        {(member.email ?? '?').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text)' }}>{member.email ?? member.accountId}</div>
      </div>
      {editingRole ? (
        <form onSubmit={handleRoleSubmit} style={{ display: 'flex', gap: 4 }}>
          <input
            className="input"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            style={{ width: 80, padding: '2px 6px', fontSize: 11 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={roleMutation.isPending}>✓</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingRole(false)}>✕</button>
        </form>
      ) : (
        <>
          <button
            className="badge badge-muted"
            title="Click to change role"
            onClick={() => setEditingRole(true)}
            style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--line)' }}
          >
            {member.role}
          </button>
          <button
            className="icon-btn"
            title="Remove member"
            onClick={handleRemove}
            disabled={removeMutation.isPending}
            style={{ color: 'var(--danger, #e53e3e)', fontSize: 13 }}
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}

// ── InvitationRow ─────────────────────────────────────────────────────────────

function InvitationRow({ orgId, invitation }: { orgId: string; invitation: { id: string; email: string; role: string; expiresAt: string } }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const revokeMutation = useMutation(useRevokeOrgInvitationMutationOptions(orgId, invitation.id))

  async function handleRevoke() {
    try {
      await revokeMutation.mutateAsync()
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.org(orgId) })
      toast.success('Invitation revoked')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to revoke invitation')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>{invitation.email}</div>
      <span className="badge badge-amber">{invitation.role}</span>
      <button
        className="icon-btn"
        title="Revoke invitation"
        onClick={handleRevoke}
        disabled={revokeMutation.isPending}
        style={{ color: 'var(--danger, #e53e3e)', fontSize: 13 }}
      >
        ✕
      </button>
    </div>
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
      <OrgDetailContent orgId={orgId} onDeleted={onClose} />
    </Drawer>
  )
}

// ── Re-export count for page header ──────────────────────────────────────────

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
