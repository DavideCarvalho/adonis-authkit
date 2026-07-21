'use client';

import {
  Building2,
  KeyRound,
  LayoutDashboard,
  Monitor,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * Interactive mock of the AuthKit Admin Console: every screen is
 * navigable with mocked data — search, pagination and toggles work
 * locally; mutating actions (invite, create, revoke) are inert.
 */

/* ----------------------------- mock data ----------------------------- */

const METRIC_CARDS = [
  { label: 'Total users', value: '4 821', delta: '+12% this week' },
  { label: 'Active sessions', value: '318', delta: '+3% today' },
  { label: 'OAuth clients', value: '14', delta: '2 new' },
  { label: 'Lockouts (24 h)', value: '7', delta: '-40% vs yesterday' },
] as const;

const USER_ROWS = [
  { name: 'Jane Smith', email: 'jane@acme.dev', role: 'Admin', status: 'active' },
  { name: 'Tom Hanks', email: 'tom@acme.dev', role: 'Member', status: 'active' },
  { name: 'Sara Lee', email: 'sara@acme.dev', role: 'Member', status: 'locked' },
  { name: 'Alex Kim', email: 'alex@acme.dev', role: 'Viewer', status: 'active' },
  { name: 'Maria Souza', email: 'maria@acme.dev', role: 'Admin', status: 'active' },
  { name: 'John Doe', email: 'john@acme.dev', role: 'Member', status: 'active' },
  { name: 'Lin Wei', email: 'lin@acme.dev', role: 'Viewer', status: 'active' },
  { name: 'Ana Costa', email: 'ana@acme.dev', role: 'Member', status: 'locked' },
] as const;

const SESSION_ROWS = [
  { user: 'jane@acme.dev', device: 'Chrome · macOS', ip: '189.40.12.7', seen: '2 min ago' },
  { user: 'tom@acme.dev', device: 'Safari · iOS', ip: '177.92.3.41', seen: '14 min ago' },
  { user: 'maria@acme.dev', device: 'Firefox · Linux', ip: '201.17.88.2', seen: '1 h ago' },
  { user: 'john@acme.dev', device: 'Edge · Windows', ip: '45.231.9.18', seen: '3 h ago' },
  { user: 'lin@acme.dev', device: 'Chrome · Android', ip: '190.102.44.9', seen: '6 h ago' },
] as const;

const CLIENT_ROWS = [
  { name: 'Acme Dashboard', id: 'akc_9f2…c41', type: 'SPA · PKCE', uris: 2 },
  { name: 'Mobile App', id: 'akc_77b…e90', type: 'Native · PKCE', uris: 1 },
  { name: 'Billing Service', id: 'akc_3aa…b12', type: 'M2M · client_credentials', uris: 0 },
  { name: 'Partner Portal', id: 'akc_c05…77f', type: 'Web · confidential', uris: 3 },
] as const;

const ROLE_ROWS = [
  {
    name: 'Admin',
    members: 3,
    perms: ['users:write', 'clients:write', 'audit:read', 'settings:write'],
  },
  { name: 'Member', members: 4_512, perms: ['profile:write', 'orgs:read'] },
  { name: 'Viewer', members: 306, perms: ['profile:read'] },
] as const;

const ORG_ROWS = [
  { name: 'Acme Inc', slug: 'acme', members: 4_204, plan: 'Enterprise' },
  { name: 'Acme Labs', slug: 'acme-labs', members: 422, plan: 'Pro' },
  { name: 'Sandbox', slug: 'sandbox', members: 195, plan: 'Free' },
] as const;

const AUDIT_ROWS = [
  { event: 'user.login', actor: 'jane@acme.dev', detail: 'password + TOTP', when: '2 min ago' },
  { event: 'client.created', actor: 'jane@acme.dev', detail: 'Partner Portal', when: '1 h ago' },
  {
    event: 'user.locked',
    actor: 'system',
    detail: 'sara@acme.dev · 5 failed attempts',
    when: '3 h ago',
  },
  {
    event: 'org.member_invited',
    actor: 'maria@acme.dev',
    detail: 'lin@acme.dev → Acme Labs',
    when: '5 h ago',
  },
  { event: 'session.revoked', actor: 'tom@acme.dev', detail: 'Safari · iOS', when: '8 h ago' },
  {
    event: 'settings.updated',
    actor: 'jane@acme.dev',
    detail: 'MFA required: on',
    when: '1 d ago',
  },
] as const;

const SCREENS = [
  { key: 'overview', icon: LayoutDashboard, label: 'Overview' },
  { key: 'users', icon: Users, label: 'Users' },
  { key: 'sessions', icon: Monitor, label: 'Sessions' },
  { key: 'clients', icon: KeyRound, label: 'Clients' },
  { key: 'roles', icon: ShieldCheck, label: 'Roles' },
  { key: 'orgs', icon: Building2, label: 'Organizations' },
  { key: 'audit', icon: ScrollText, label: 'Audit' },
  { key: 'settings', icon: Settings, label: 'Settings' },
] as const;

type ScreenKey = (typeof SCREENS)[number]['key'];

/* --------------------------- building blocks --------------------------- */

const DEMO_TITLE = 'Demo — read-only';

function DemoButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={DEMO_TITLE}
      className="cursor-default rounded-lg bg-[#625fff] px-4 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
    >
      {children}
    </button>
  );
}

function PageTitle({ kicker, title, action }: { kicker: string; title: string; action?: string }) {
  return (
    <div className="mb-5 flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          {kicker}
        </p>
        <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      </div>
      {action && <DemoButton>{action}</DemoButton>}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#16161b]/40">
      <div
        className="grid border-b border-zinc-800 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-600"
        style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}
      >
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Row({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      className="grid items-center border-b border-zinc-800/60 px-4 py-3 text-sm last:border-0"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function StatusPill({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
      }`}
    >
      <span className={`size-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {ok ? okLabel : badLabel}
    </span>
  );
}

function MetricCards() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {METRIC_CARDS.map((card) => (
        <div key={card.label} className="rounded-xl border border-zinc-800 bg-[#16161b]/60 p-3">
          <p className="text-xs text-zinc-500">{card.label}</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{card.value}</p>
          <p className="mt-0.5 font-mono text-[11px] text-emerald-400">{card.delta}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- screens ------------------------------- */

function OverviewScreen() {
  const bars = [42, 58, 50, 75, 66, 88, 79, 95, 84, 70, 90, 100];
  return (
    <>
      <PageTitle kicker="Identity" title="Overview" />
      <MetricCards />
      <div className="rounded-xl border border-zinc-800 bg-[#16161b]/40 p-4">
        <p className="mb-3 text-xs font-medium text-zinc-400">Sign-ins — last 12 weeks</p>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-[#625fff]/40 to-[#625fff]"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

const PAGE_SIZE = 4;

function UsersScreen() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () =>
      USER_ROWS.filter(
        (u) =>
          (role === 'All' || u.role === role) &&
          (u.name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())),
      ),
    [search, role],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <PageTitle kicker="Identity" title="Users" action="Invite user" />
      <div className="mb-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search by name or email…"
          className="flex-1 rounded-lg border border-zinc-700 bg-[#16161b]/60 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-[#625fff] focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-zinc-700 bg-[#16161b]/60 px-3 py-2 text-sm text-zinc-400 focus:border-[#625fff] focus:outline-none"
        >
          {['All', 'Admin', 'Member', 'Viewer'].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <Table head={['Name', 'Email', 'Role', 'Status']}>
        {visible.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-600">No users match.</div>
        ) : (
          visible.map((row) => (
            <Row key={row.email} cols={4}>
              <span className="font-medium text-zinc-200">{row.name}</span>
              <span className="truncate font-mono text-xs text-zinc-500">{row.email}</span>
              <span className="text-zinc-400">{row.role}</span>
              <StatusPill ok={row.status === 'active'} okLabel="active" badLabel="locked" />
            </Row>
          ))
        )}
      </Table>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-600">
        <span>
          {filtered.length === USER_ROWS.length ? '4 821' : filtered.length} users · page{' '}
          {current + 1} of {filtered.length === USER_ROWS.length ? 49 : pages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, current - 1))}
            disabled={current === 0}
            className="rounded border border-zinc-800 px-2 py-1 text-zinc-400 transition-colors enabled:hover:border-[#625fff]/60 enabled:hover:text-zinc-200 disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(pages - 1, current + 1))}
            disabled={current >= pages - 1}
            className="rounded border border-zinc-800 px-2 py-1 text-zinc-400 transition-colors enabled:hover:border-[#625fff]/60 enabled:hover:text-zinc-200 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}

function SessionsScreen() {
  return (
    <>
      <PageTitle kicker="Identity" title="Sessions" />
      <Table head={['User', 'Device', 'IP', 'Last seen', '']}>
        {SESSION_ROWS.map((s) => (
          <Row key={s.user + s.device} cols={5}>
            <span className="truncate font-mono text-xs text-zinc-400">{s.user}</span>
            <span className="text-zinc-300">{s.device}</span>
            <span className="font-mono text-xs text-zinc-500">{s.ip}</span>
            <span className="text-zinc-500">{s.seen}</span>
            <button
              type="button"
              title={DEMO_TITLE}
              className="w-fit cursor-default rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:border-rose-500/50 hover:text-rose-400"
            >
              Revoke
            </button>
          </Row>
        ))}
      </Table>
    </>
  );
}

function ClientsScreen() {
  return (
    <>
      <PageTitle kicker="OAuth" title="Clients" action="Create client" />
      <Table head={['Name', 'Client ID', 'Type', 'Redirect URIs']}>
        {CLIENT_ROWS.map((c) => (
          <Row key={c.name} cols={4}>
            <span className="font-medium text-zinc-200">{c.name}</span>
            <span className="font-mono text-xs text-zinc-500">{c.id}</span>
            <span className="text-zinc-400">{c.type}</span>
            <span className="text-zinc-500">{c.uris}</span>
          </Row>
        ))}
      </Table>
    </>
  );
}

function RolesScreen() {
  return (
    <>
      <PageTitle kicker="Access control" title="Roles" action="Create role" />
      <div className="space-y-3">
        {ROLE_ROWS.map((r) => (
          <div key={r.name} className="rounded-xl border border-zinc-800 bg-[#16161b]/40 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-zinc-200">{r.name}</span>
              <span className="text-xs text-zinc-500">
                {r.members.toLocaleString('en-US')} members
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.perms.map((p) => (
                <span
                  key={p}
                  className="rounded bg-[#625fff]/10 px-2 py-0.5 font-mono text-[11px] text-[#9a8bff]"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OrgsScreen() {
  return (
    <>
      <PageTitle kicker="Identity" title="Organizations" action="Create organization" />
      <Table head={['Name', 'Slug', 'Members', 'Plan']}>
        {ORG_ROWS.map((o) => (
          <Row key={o.slug} cols={4}>
            <span className="font-medium text-zinc-200">{o.name}</span>
            <span className="font-mono text-xs text-zinc-500">{o.slug}</span>
            <span className="text-zinc-400">{o.members.toLocaleString('en-US')}</span>
            <span className="text-zinc-500">{o.plan}</span>
          </Row>
        ))}
      </Table>
    </>
  );
}

function AuditScreen() {
  return (
    <>
      <PageTitle kicker="Compliance" title="Audit log" />
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#16161b]/40">
        {AUDIT_ROWS.map((a, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-zinc-800/60 px-4 py-2.5 text-sm last:border-0"
          >
            <span className="w-40 shrink-0 font-mono text-xs text-[#9a8bff]">{a.event}</span>
            <span className="hidden w-36 shrink-0 truncate font-mono text-xs text-zinc-500 sm:block">
              {a.actor}
            </span>
            <span className="flex-1 truncate text-zinc-400">{a.detail}</span>
            <span className="shrink-0 text-xs text-zinc-600">{a.when}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Toggle({ label, hint, initial }: { label: string; hint: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      onClick={() => setOn(!on)}
      className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-[#16161b]/40 p-4 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-[#625fff]' : 'bg-zinc-700'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

function SettingsScreen() {
  return (
    <>
      <PageTitle kicker="Tenant" title="Settings" />
      <div className="space-y-3">
        <Toggle label="Require MFA" hint="Force TOTP enrollment for every user" initial />
        <Toggle label="Breached-password check" hint="Reject passwords found in HIBP" initial />
        <Toggle
          label="Self-service sign-up"
          hint="Allow users to register without an invite"
          initial={false}
        />
        <Toggle
          label="Session inactivity timeout"
          hint="Expire sessions idle for 30 days"
          initial
        />
      </div>
    </>
  );
}

const SCREEN_COMPONENTS: Record<ScreenKey, () => React.ReactNode> = {
  overview: OverviewScreen,
  users: UsersScreen,
  sessions: SessionsScreen,
  clients: ClientsScreen,
  roles: RolesScreen,
  orgs: OrgsScreen,
  audit: AuditScreen,
  settings: SettingsScreen,
};

/* ------------------------------- shell ------------------------------- */

export function AdminConsoleDemo() {
  const [screen, setScreen] = useState<ScreenKey>('users');
  const Screen = SCREEN_COMPONENTS[screen];

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] text-left shadow-2xl shadow-black/50 ring-1 ring-white/5">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/90 px-4 py-2.5">
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="ml-4 truncate font-mono text-xs text-zinc-500">
          auth.acme.dev · /admin/{screen}
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-[#9a8bff]">
          <span className="animate-ak-blink size-1.5 rounded-full bg-[#9a8bff]" />
          live demo — click around
        </span>
      </div>

      {/* app shell */}
      <div className="flex min-h-[480px]">
        {/* sidebar */}
        <aside className="hidden w-48 shrink-0 border-r border-zinc-800 bg-[#0f0f13] sm:block">
          <div className="border-b border-zinc-800 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
              Acme
            </p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">Auth Console</p>
          </div>
          <nav className="p-2">
            {SCREENS.map((item) => {
              const Icon = item.icon;
              const active = item.key === screen;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setScreen(item.key)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-[#625fff]/20 font-medium text-[#9a8bff]'
                      : 'text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* mobile screen switcher */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2 sm:hidden">
            {SCREENS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setScreen(item.key)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                  item.key === screen ? 'bg-[#625fff]/20 text-[#9a8bff]' : 'text-zinc-500'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden p-5">
            <Screen />
          </div>
        </div>
      </div>
    </div>
  );
}
