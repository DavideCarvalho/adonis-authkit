/**
 * Testes do AccountOrgsController (fluxo MEMBER-FACING /account/orgs/*).
 *
 * Cobre os achados de segurança do GRUPO C:
 *   - H3: revogação de convite escopada por org (IDOR cross-org).
 *   - H4: validação de role contra o catálogo + regra "só owner concede owner".
 *
 * Usa store em memória + fake HttpContext (sem roteador real). O
 * `resolveRuntimeSettings` cai no fail-safe (config catalog) porque
 * `make('lucid.db')` rejeita — então o catálogo efetivo é
 * `cfg.organizations.roles`.
 */
import { test } from '@japa/runner'
import AccountOrgsController from '../../src/host/controllers/account_orgs_controller.js'
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js'
import type { AccountStore } from '../../src/accounts/account_store.js'

function buildMemoryStore(): AccountStore & Record<string, any> {
  const accounts = new Map<string, any>()
  const orgs = new Map<string, any>()
  const members = new Map<string, Map<string, any>>() // orgId → accountId → {role}
  const invitations = new Map<string, any>()
  let counter = 0
  const newId = () => `id-${++counter}`

  const store: any = {
    findById: async (id: string) => accounts.get(id) ?? null,
    findByEmail: async (email: string) => [...accounts.values()].find((a) => a.email === email) ?? null,
    verifyCredentials: async () => null,
    create: async (input: any) => {
      const acc = { id: input.id ?? newId(), email: input.email, name: null, globalRoles: [] }
      accounts.set(acc.id, acc)
      return acc
    },
    issuePasswordResetToken: async () => null,
    consumePasswordResetToken: async () => false,
    issueEmailVerificationToken: async () => null,
    consumeEmailVerificationToken: async () => false,
    listAccounts: async () => ({ data: [...accounts.values()], total: accounts.size }),
    setGlobalRoles: async () => {},

    createOrg: async (input: any) => {
      const org = { id: newId(), name: input.name, slug: input.slug, logoUrl: null, metadata: null, createdAt: new Date().toISOString() }
      orgs.set(org.id, org)
      const m = new Map<string, any>()
      m.set(input.ownerAccountId, { role: 'owner' })
      members.set(org.id, m)
      return org
    },
    findOrgById: async (orgId: string) => orgs.get(orgId) ?? null,
    findOrgBySlug: async () => null,
    listOrgsForAccount: async () => [],
    updateOrg: async () => null,
    deleteOrg: async () => false,
    listOrgMembers: async (orgId: string) => {
      const m = members.get(orgId)
      if (!m) return []
      return [...m.entries()].map(([accountId, v]) => ({ accountId, email: null, role: v.role, joinedAt: '' }))
    },
    addOrgMember: async (orgId: string, accountId: string, role: string) => {
      if (!members.has(orgId)) members.set(orgId, new Map())
      members.get(orgId)!.set(accountId, { role })
    },
    removeOrgMember: async () => ({ ok: true }),
    updateOrgMemberRole: async () => ({ ok: true }),
    getOrgMembership: async (orgId: string, accountId: string) => {
      const v = members.get(orgId)?.get(accountId)
      return v ? { role: v.role } : null
    },
    createOrgInvitation: async (input: any) => {
      const id = newId()
      const inv = {
        id,
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        invitedBy: input.invitedBy,
        tokenHash: 'hash-' + id,
        expiresAt: new Date(Date.now() + input.ttlHours * 3600000).toISOString(),
        acceptedAt: null,
        createdAt: new Date().toISOString(),
      }
      invitations.set(id, inv)
      return { invitation: inv, token: 'tok-' + id }
    },
    findInvitationByTokenHash: async (hash: string) => [...invitations.values()].find((i) => i.tokenHash === hash) ?? null,
    listPendingInvitationsForOrg: async (orgId: string) =>
      [...invitations.values()].filter((i) => i.organizationId === orgId && !i.acceptedAt),
    listPendingInvitationsForEmail: async () => [],
    acceptInvitation: async () => ({ ok: true }),
    revokeInvitation: async (organizationId: string, invitationId: string) => {
      const inv = invitations.get(invitationId)
      if (!inv || inv.organizationId !== organizationId) return false
      invitations.delete(invitationId)
      return true
    },
    removeAccountFromAllOrgs: async () => ({ memberships: 0, invitations: 0 }),

    // helpers de teste
    _invitations: invitations,
    _accounts: accounts,
  }
  return store
}

function buildCfg(store: AccountStore) {
  return {
    accountStore: store,
    organizations: { roles: ['owner', 'admin', 'member'], allowSelfCreate: true, invitationTtlHours: 72 },
    audit: { events: [] as any[], record: async () => {} },
    mail: {},
  } as any
}

function fakeCtx(opts: {
  actorId: string
  params?: Record<string, string>
  inputs?: Record<string, string>
  cfg: any
}) {
  let status = 200
  let body: any
  let redirected: string | null = null
  const captured = {
    status: () => status,
    body: () => body,
    redirected: () => redirected,
  }
  const setBody = (b: any) => { body = b; return b }
  const err = (code: number) => (payload?: any) => { status = code; return setBody(payload) }

  const ctx: any = {
    request: {
      input: (k: string, def?: string) => opts.inputs?.[k] ?? def,
      cookie: () => undefined,
      protocol: () => 'https',
      host: () => 'localhost',
      secure: () => true,
    },
    params: opts.params ?? {},
    response: {
      forbidden: err(403),
      notFound: err(404),
      unprocessableEntity: err(422),
      redirect: (url: string) => { redirected = url; return null },
      cookie: () => {},
      clearCookie: () => {},
    },
    session: { get: (k: string) => (k === ACCOUNT_SESSION_KEY ? opts.actorId : undefined) },
    containerResolver: {
      // make('lucid.db') rejeita → getRuntimeSettings cai no fail-safe (null → config catalog).
      // make('authkit.server') resolve a config.
      make: async (name: string) => {
        if (name === 'lucid.db') throw new Error('no db in test')
        if (name === 'authkit.server') return { config: opts.cfg }
        throw new Error('unknown binding: ' + name)
      },
    },
  }
  return { ctx, captured }
}

test.group('AccountOrgsController — member-facing security (H3/H4)', () => {
  // ── H3: revogação escopada por org ──────────────────────────────────────────

  test('H3: owner da org A não revoga convite da org B (IDOR) — convite permanece', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const ownerA = await store.create({ email: 'a@x.com' })
    const ownerB = await store.create({ email: 'b@x.com' })
    const orgA = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: ownerA.id })
    const orgB = await (store as any).createOrg({ name: 'B', slug: 'b', ownerAccountId: ownerB.id })
    const { invitation: invB } = await (store as any).createOrgInvitation({
      organizationId: orgB.id, email: 'victim@x.com', role: 'member', invitedBy: ownerB.id, ttlHours: 24,
    })

    // Owner A tenta revogar convite da org B passando params.id = orgA (que ele controla).
    const { ctx } = fakeCtx({ actorId: ownerA.id, params: { id: orgA.id, invId: invB.id }, cfg })
    await ctrl.revokeInvitation(ctx)

    // Convite da org B continua existindo.
    const pendingB = await (store as any).listPendingInvitationsForOrg(orgB.id)
    assert.lengthOf(pendingB, 1)
    assert.equal(pendingB[0].id, invB.id)
  })

  test('H3: owner revoga convite da própria org → ok', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const owner = await store.create({ email: 'o@x.com' })
    const org = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: owner.id })
    const { invitation } = await (store as any).createOrgInvitation({
      organizationId: org.id, email: 'inv@x.com', role: 'member', invitedBy: owner.id, ttlHours: 24,
    })

    const { ctx } = fakeCtx({ actorId: owner.id, params: { id: org.id, invId: invitation.id }, cfg })
    await ctrl.revokeInvitation(ctx)

    const pending = await (store as any).listPendingInvitationsForOrg(org.id)
    assert.lengthOf(pending, 0)
  })

  // ── H4: validação de role + owner-concede-owner ─────────────────────────────

  test('H4: admin (não-owner) convidando como owner → forbidden (escalonamento)', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const owner = await store.create({ email: 'o@x.com' })
    const adminUser = await store.create({ email: 'admin@x.com' })
    const org = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: owner.id })
    await (store as any).addOrgMember(org.id, adminUser.id, 'admin')

    const { ctx, captured } = fakeCtx({
      actorId: adminUser.id,
      params: { id: org.id },
      inputs: { email: 'new@x.com', role: 'owner' },
      cfg,
    })
    await ctrl.invite(ctx)

    assert.equal(captured.status(), 403)
    // Nenhum convite criado.
    assert.lengthOf(await (store as any).listPendingInvitationsForOrg(org.id), 0)
  })

  test('H4: owner convidando como owner → ok', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const owner = await store.create({ email: 'o@x.com' })
    const org = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: owner.id })

    const { ctx, captured } = fakeCtx({
      actorId: owner.id,
      params: { id: org.id },
      inputs: { email: 'co-owner@x.com', role: 'owner' },
      cfg,
    })
    await ctrl.invite(ctx)

    assert.equal(captured.redirected(), '/account/orgs')
    const pending = await (store as any).listPendingInvitationsForOrg(org.id)
    assert.lengthOf(pending, 1)
    assert.equal(pending[0].role, 'owner')
  })

  test('H4: role fora do catálogo → 422 (não cria convite)', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const owner = await store.create({ email: 'o@x.com' })
    const org = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: owner.id })

    const { ctx, captured } = fakeCtx({
      actorId: owner.id,
      params: { id: org.id },
      inputs: { email: 'x@x.com', role: 'superadmin' },
      cfg,
    })
    await ctrl.invite(ctx)

    assert.equal(captured.status(), 422)
    assert.lengthOf(await (store as any).listPendingInvitationsForOrg(org.id), 0)
  })

  test('H4: admin convidando como member (catálogo) → ok', async ({ assert }) => {
    const store = buildMemoryStore()
    const cfg = buildCfg(store)
    const ctrl = new AccountOrgsController()

    const owner = await store.create({ email: 'o@x.com' })
    const adminUser = await store.create({ email: 'admin@x.com' })
    const org = await (store as any).createOrg({ name: 'A', slug: 'a', ownerAccountId: owner.id })
    await (store as any).addOrgMember(org.id, adminUser.id, 'admin')

    const { ctx, captured } = fakeCtx({
      actorId: adminUser.id,
      params: { id: org.id },
      inputs: { email: 'newmember@x.com', role: 'member' },
      cfg,
    })
    await ctrl.invite(ctx)

    assert.equal(captured.redirected(), '/account/orgs')
    const pending = await (store as any).listPendingInvitationsForOrg(org.id)
    assert.lengthOf(pending, 1)
    assert.equal(pending[0].role, 'member')
  })
})
