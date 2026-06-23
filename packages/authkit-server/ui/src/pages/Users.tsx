import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQueryState, parseAsInteger, parseAsString } from 'nuqs'
import {
  useCreateUserMutationOptions,
  authkitKeys,
} from '@adonis-agora/authkit-react'
import { Modal } from '../components/Modal'
import { useToast } from '../lib/toast'
import { useDebounce } from '../lib/use_debounce'
import { UsersTableContainer, UserDetailDrawer } from '../containers/users.containers'

export function Users() {
  const toast = useToast()
  const queryClient = useQueryClient()

  // Estado de rota (URL): paginação, busca e drawer de detalhe via nuqs.
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''))
  const [detailUserId, setDetailUserId] = useQueryState('user')
  const dSearch = useDebounce(search, 300)

  // Estado efêmero de UI (modal/form) permanece local.
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', invite: false })

  const createMutation = useMutation(useCreateUserMutationOptions())

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createMutation.mutateAsync({
        email: createForm.email,
        name: createForm.name || undefined,
        password: createForm.password || undefined,
        invite: createForm.invite,
      })
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.users() })
      toast.success('User created')
      setCreateOpen(false)
      setCreateForm({ email: '', name: '', password: '', invite: false })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Users</div>
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

      {/* Search bar */}
      <div className="panel" style={{ marginBottom: 0 }}>
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
      </div>

      {/* Users table container */}
      <UsersTableContainer
        search={dSearch}
        page={page}
        onPage={setPage}
        onSelectUser={setDetailUserId}
        onInvalidate={() => queryClient.invalidateQueries({ queryKey: authkitKeys.admin.users() })}
      />

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create User"
        footer={
          <>
            <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <span className="spinner sm" /> : 'Create User'}
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
      {detailUserId && (
        <UserDetailDrawer
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          onMutated={() => queryClient.invalidateQueries({ queryKey: authkitKeys.admin.users() })}
        />
      )}
    </div>
  )
}
