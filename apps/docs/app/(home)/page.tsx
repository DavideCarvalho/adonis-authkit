import {
  ArrowRight,
  Fingerprint,
  KeyRound,
  Lock,
  Monitor,
  ScrollText,
  ShieldCheck,
  Terminal,
  UserCog,
  Users,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { AdminConsoleDemo } from './admin-console-demo';

const GITHUB_URL = 'https://github.com/DavideCarvalho/adonis-authkit';

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <BackgroundTexture />
      <Hero />
      <AdminConsoleMockSection />
      <ReactComponentsSection />
      <TypedClientSection />
      <FeatureGrid />
      <WireItIn />
      <FinalCta />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Background — dot grid + violet glow, CSS only                              */
/* -------------------------------------------------------------------------- */

function BackgroundTexture() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <div
        className="absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full blur-[120px]"
        style={{
          background:
            'radial-gradient(circle, rgb(98 95 255 / 0.18) 0%, rgb(98 95 255 / 0.05) 40%, transparent 70%)',
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-20 text-center sm:pt-28">
      <div className="ak-stagger flex flex-col items-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 font-mono text-xs text-fd-muted-foreground backdrop-blur">
          <span className="relative flex h-2 w-2">
            <span className="animate-ak-blink absolute inline-flex h-2 w-2 rounded-full bg-[#827cff]" />
          </span>
          OpenID Connect, built for AdonisJS
        </span>

        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
          A complete identity provider,{' '}
          <span className="bg-gradient-to-r from-[#625fff] to-[#9a8bff] bg-clip-text text-transparent">
            dropped into your app.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-fd-muted-foreground">
          A drop-in OpenID Connect authorization server, a batteries-included admin console,
          Clerk-style React components, and a typed TanStack Query client — organizations, JWT
          access tokens, LGPD/GDPR compliance, MFA, and audit logging. Run it standalone or embedded
          inside your AdonisJS app.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-[#625fff] px-5 py-2.5 font-medium text-white shadow-[0_0_24px_-6px] shadow-[#625fff]/50 transition-all hover:bg-[#7773ff] hover:shadow-[#7773ff]/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            Getting started
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-card/40 px-5 py-2.5 font-medium backdrop-blur transition-colors hover:bg-fd-accent"
          >
            GitHub
          </a>
        </div>

        <div className="mt-8 inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/40 px-4 py-2 font-mono text-sm backdrop-blur">
          <span className="text-fd-muted-foreground select-none">$</span>
          <span>
            npm i <span className="text-fd-primary">@adonis-agora/authkit-server</span>
          </span>
        </div>

        <p className="mt-6 font-mono text-xs text-fd-muted-foreground">
          3 packages on npm · admin console included · React components + hooks · standalone or
          embedded
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Admin Console — interactive mock right under the hero (peeks above the     */
/*  fold), with the section copy below it                                      */
/* -------------------------------------------------------------------------- */

function AdminConsoleMockSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-[#625fff]/10 blur-3xl"
        />
        <AdminConsoleDemo />
        <p className="mt-5 text-center font-mono text-xs text-fd-muted-foreground">
          This is a live mock — click the sidebar. The real console ships inside the npm package:
          React SPA, zero extra build step.
        </p>
      </div>

      {/* section copy — below the visual, not before it */}
      <div className="mt-14 text-center">
        <span className="inline-block rounded-full border border-[#625fff]/40 bg-[#625fff]/10 px-3 py-1 font-mono text-xs text-[#9a8bff]">
          batteries included
        </span>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          A full admin console, out of the box
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Enable it with two config lines and get a Vite-built React SPA with dark/light themes,
          violet accent{' '}
          <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-xs">#625fff</code>, and
          eight screens: Overview, Users, Sessions, OAuth Clients, Roles, Organizations, Audit, and
          Settings.
        </p>
        <Link
          href="/docs/admin-console"
          className="mt-4 inline-flex items-center gap-1.5 font-medium text-[#9a8bff] transition-opacity hover:opacity-80"
        >
          Admin Console docs
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  React components section                                                    */
/* -------------------------------------------------------------------------- */

interface ComponentItem {
  name: string;
  desc: string;
}

const COMPONENT_ITEMS: readonly ComponentItem[] = [
  { name: 'SignInButton', desc: 'Starts the OIDC redirect. Hidden when already authenticated.' },
  {
    name: 'SignOutButton',
    desc: 'Logs out the current user. Renders nothing when unauthenticated.',
  },
  { name: 'UserButton', desc: 'Avatar + dropdown: profile, orgs, sign out — Clerk-style.' },
  { name: 'UserProfile', desc: 'Full account management panel: profile, password, MFA, sessions.' },
  {
    name: 'OrganizationSwitcher',
    desc: 'Switch between orgs or create one. Syncs the active org claim.',
  },
  {
    name: 'OrganizationProfile',
    desc: 'Org settings panel: members, invitations, roles, danger zone.',
  },
  { name: 'AuthorizedApps', desc: 'Lists and revokes OAuth client consents for the current user.' },
  {
    name: 'Avatar',
    desc: 'User avatar with fallback initials. Headless-style, accepts className.',
  },
  {
    name: 'PasswordStrengthMeter',
    desc: 'Visual strength bar + HIBP breach check. Plugs into react-hook-form.',
  },
];

function ReactComponentsSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* left: description + component list */}
        <div>
          <span className="inline-block rounded-full border border-[#625fff]/40 bg-[#625fff]/10 px-3 py-1 font-mono text-xs text-[#9a8bff]">
            @adonis-agora/authkit-react
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Clerk-style React components
          </h2>
          <p className="mt-3 text-fd-muted-foreground">
            Pre-built, themeable UI components that consume the auth state the AdonisJS host already
            resolved — no extra wiring beyond the initial provider setup. Drop them into any layout.
          </p>
          <Link
            href="/docs/components"
            className="mt-4 inline-flex items-center gap-1.5 font-medium text-[#9a8bff] transition-opacity hover:opacity-80"
          >
            Component reference
            <ArrowRight className="size-3.5" />
          </Link>

          <ul className="mt-8 space-y-3">
            {COMPONENT_ITEMS.map((c) => (
              <li key={c.name} className="flex items-start gap-3">
                <code className="mt-0.5 shrink-0 rounded bg-[#625fff]/15 px-2 py-0.5 font-mono text-xs text-[#9a8bff]">
                  {c.name}
                </code>
                <span className="text-sm text-fd-muted-foreground">{c.desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* right: import snippet + gating components */}
        <div className="space-y-4">
          {/* import snippet */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-xl shadow-black/30 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-2.5">
              <Terminal className="size-3.5 text-zinc-500" />
              <span className="font-mono text-xs text-zinc-500">app.tsx</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
              <code>
                <div className="whitespace-pre">
                  <span className="text-[#9a8bff]">import</span>
                  <span className="text-zinc-300">
                    {' '}
                    {`'@adonis-agora/authkit-react/styles.css'`}
                  </span>
                </div>
                <div className="whitespace-pre"> </div>
                <div className="whitespace-pre">
                  <span className="text-[#9a8bff]">import</span>
                  <span className="text-zinc-300"> {'{'}</span>
                </div>
                {[
                  'SignInButton',
                  'UserButton',
                  'UserProfile',
                  'OrganizationSwitcher',
                  'OrganizationProfile',
                  'AuthorizedApps',
                  'Avatar',
                  'PasswordStrengthMeter',
                ].map((name) => (
                  <div key={name} className="whitespace-pre">
                    <span className="text-amber-300">
                      {'  '}
                      {name}
                    </span>
                    <span className="text-zinc-300">,</span>
                  </div>
                ))}
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'}'}</span>
                  <span className="text-[#9a8bff]"> from</span>
                  <span className="text-teal-300"> {`'@adonis-agora/authkit-react'`}</span>
                </div>
                <div className="whitespace-pre"> </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-600">{'// in any layout:'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'<'}</span>
                  <span className="text-sky-400">UserButton</span>
                  <span className="text-zinc-300">{' />'}</span>
                  <span className="text-zinc-600">{'  // avatar + org switcher'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'<'}</span>
                  <span className="text-sky-400">SignInButton</span>
                  <span className="text-zinc-300">{' returnTo='}</span>
                  <span className="text-teal-300">{`"/dashboard"`}</span>
                  <span className="text-zinc-300">{' />'}</span>
                </div>
              </code>
            </pre>
          </div>

          {/* gating primitives */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-xl shadow-black/30 ring-1 ring-white/5">
            <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-2.5">
              <Terminal className="size-3.5 text-zinc-500" />
              <span className="font-mono text-xs text-zinc-500">auth gates</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
              <code>
                <div className="whitespace-pre">
                  <span className="text-[#9a8bff]">import</span>
                  <span className="text-zinc-300"> {'{ Authenticated, Can, useAuth }'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-[#9a8bff]"> from</span>
                  <span className="text-teal-300"> {`'@adonis-agora/authkit-react'`}</span>
                </div>
                <div className="whitespace-pre"> </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'<'}</span>
                  <span className="text-sky-400">Authenticated</span>
                  <span className="text-amber-300"> fallback</span>
                  <span className="text-zinc-300">={'{'}</span>
                  <span className="text-zinc-300">{'<'}</span>
                  <span className="text-sky-400">SignInButton</span>
                  <span className="text-zinc-300">{' />}>'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'  <'}</span>
                  <span className="text-sky-400">Can</span>
                  <span className="text-amber-300"> ability</span>
                  <span className="text-zinc-300">
                    ={'`'}posts:publish{'`'}
                  </span>
                  <span className="text-zinc-300">{'>'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'    <'}</span>
                  <span className="text-zinc-400">PublishButton</span>
                  <span className="text-zinc-300">{' />'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'  </'}</span>
                  <span className="text-sky-400">Can</span>
                  <span className="text-zinc-300">{'>'}</span>
                </div>
                <div className="whitespace-pre">
                  <span className="text-zinc-300">{'</'}</span>
                  <span className="text-sky-400">Authenticated</span>
                  <span className="text-zinc-300">{'>'}</span>
                </div>
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Typed client + TanStack Query section                                       */
/* -------------------------------------------------------------------------- */

const HOOKS_LIST = [
  { name: 'useUsersQueryOptions', kind: 'query' },
  { name: 'useUserQueryOptions', kind: 'query' },
  { name: 'useSessionsQueryOptions', kind: 'query' },
  { name: 'useOrganizationsQueryOptions', kind: 'query' },
  { name: 'useAuditQueryOptions', kind: 'query' },
  { name: 'useCreateUserMutationOptions', kind: 'mutation' },
  { name: 'useUpdateUserMutationOptions', kind: 'mutation' },
  { name: 'useRevokeSessionMutationOptions', kind: 'mutation' },
  { name: 'useImpersonateMutationOptions', kind: 'mutation' },
] as const;

const CLIENT_CODE_LINES: readonly { tokens: { text: string; cls?: string }[] }[] = [
  {
    tokens: [
      { text: 'import', cls: 'text-[#9a8bff]' },
      { text: ' {' },
      { text: ' createAuthkitQueryClient', cls: 'text-amber-300' },
      { text: ',' },
    ],
  },
  {
    tokens: [
      { text: '         ' },
      { text: 'AuthkitClientProvider', cls: 'text-amber-300' },
      { text: ',' },
    ],
  },
  {
    tokens: [
      { text: '         ' },
      { text: 'useUsersQueryOptions', cls: 'text-amber-300' },
      { text: ' }' },
      { text: ' from', cls: 'text-[#9a8bff]' },
      { text: " '@adonis-agora/authkit-react'", cls: 'text-teal-300' },
    ],
  },
  { tokens: [] },
  {
    tokens: [
      { text: 'const', cls: 'text-[#9a8bff]' },
      { text: ' qc ' },
      { text: '=', cls: 'text-[#9a8bff]' },
      { text: ' ' },
      { text: 'createAuthkitQueryClient', cls: 'text-sky-400' },
      { text: '()' },
    ],
  },
  { tokens: [] },
  {
    tokens: [{ text: '// inside your admin page:', cls: 'text-zinc-600' }],
  },
  {
    tokens: [
      { text: 'const', cls: 'text-[#9a8bff]' },
      { text: ' { data } ' },
      { text: '=', cls: 'text-[#9a8bff]' },
      { text: ' ' },
      { text: 'useQuery', cls: 'text-sky-400' },
      { text: '(' },
      { text: 'useUsersQueryOptions', cls: 'text-amber-300' },
      { text: '({ search, page }))' },
    ],
  },
  { tokens: [] },
  {
    tokens: [{ text: '// typed, cached, refetched automatically', cls: 'text-zinc-600' }],
  },
  {
    tokens: [
      { text: 'data', cls: 'text-amber-300' },
      { text: '?.users  ' },
      { text: '// User[]', cls: 'text-zinc-600' },
    ],
  },
];

function TypedClientSection() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        {/* code panel */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-xl shadow-black/30 ring-1 ring-white/5">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-2.5">
            <Terminal className="size-3.5 text-zinc-500" />
            <span className="font-mono text-xs text-zinc-500">admin/users_page.tsx</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>
              {CLIENT_CODE_LINES.map((line, lineIndex) => (
                <div key={lineIndex} className="whitespace-pre">
                  {line.tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={token.cls ?? 'text-zinc-300'}>
                      {token.text}
                    </span>
                  ))}
                  {line.tokens.length === 0 ? ' ' : null}
                </div>
              ))}
            </code>
          </pre>
        </div>

        {/* right: description + hooks list */}
        <div>
          <span className="inline-block rounded-full border border-[#625fff]/40 bg-[#625fff]/10 px-3 py-1 font-mono text-xs text-[#9a8bff]">
            typed client + TanStack Query
          </span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Full type-safety, zero boilerplate
          </h2>
          <p className="mt-3 text-fd-muted-foreground">
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              createAuthkitClient
            </code>{' '}
            is a typed fetch wrapper for both the admin and account APIs. Wrap it once with{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              AuthkitClientProvider
            </code>{' '}
            and all hooks become available — no hand-written fetch calls, structured cache keys (
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
              authkitKeys.*
            </code>
            ), and auto-invalidation patterns.
          </p>
          <Link
            href="/docs/data-fetching"
            className="mt-4 inline-flex items-center gap-1.5 font-medium text-[#9a8bff] transition-opacity hover:opacity-80"
          >
            Typed Client &amp; TanStack Query docs
            <ArrowRight className="size-3.5" />
          </Link>

          <div className="mt-6 grid grid-cols-2 gap-2">
            {HOOKS_LIST.map((hook) => (
              <div
                key={hook.name}
                className="flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/40 px-3 py-2"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${hook.kind === 'query' ? 'bg-sky-400' : 'bg-[#9a8bff]'}`}
                />
                <code className="truncate font-mono text-xs text-fd-muted-foreground">
                  {hook.name}
                </code>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-fd-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-sky-400" /> query
            </span>
            {'  '}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-[#9a8bff]" /> mutation
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Feature grid                                                                */
/* -------------------------------------------------------------------------- */

interface Feature {
  icon: typeof KeyRound;
  title: string;
  body: string;
  accent: string;
  href?: string;
}

const FEATURES: readonly Feature[] = [
  {
    icon: ShieldCheck,
    title: 'Full OIDC provider',
    body: 'Authorization Code + PKCE, refresh and opaque tokens, discovery, JWKS, and back-channel logout — a spec-faithful authorization server out of the box.',
    accent: 'text-[#9a8bff]',
  },
  {
    icon: Fingerprint,
    title: 'MFA, passkeys & passwordless',
    body: 'TOTP second factor, WebAuthn passkeys, magic-link sign-in, lockout protection, and account linking — strong auth without wiring it together yourself.',
    accent: 'text-sky-400',
  },
  {
    icon: Users,
    title: 'Organizations & multi-tenancy',
    body: 'Capability-probed multi-org support: member roles, email invitations, org claims in tokens, and full Admin API / SDK / React hooks.',
    accent: 'text-violet-400',
  },
  {
    icon: Monitor,
    title: 'Admin console (React SPA)',
    body: 'A batteries-included Vite-built React SPA — overview, users, sessions, clients, roles, orgs, audit, and settings — dark/light, violet accent, zero extra build step.',
    accent: 'text-[#625fff]',
    href: '/docs/admin-console',
  },
  {
    icon: KeyRound,
    title: 'JWT ATs, compliance & hygiene',
    body: 'RFC 9068 JWT access tokens, LGPD/GDPR account deletion and data export, password policy with HIBP breach detection, lazy rehash, and bulk import.',
    accent: 'text-amber-400',
  },
  {
    icon: UserCog,
    title: 'Impersonation & admin',
    body: 'Safely act-as another user for support, with a full admin surface, bot protection, new-device notifications, and dynamic client registration.',
    accent: 'text-emerald-400',
  },
  {
    icon: Terminal,
    title: 'Typed client + TanStack hooks',
    body: 'createAuthkitClient + useUsersQueryOptions, useMutation hooks, authkitKeys — full type inference over both the admin and account APIs.',
    accent: 'text-indigo-400',
    href: '/docs/data-fetching',
  },
  {
    icon: ScrollText,
    title: 'Audit & observability',
    body: 'Every auth event recorded, plus OpenTelemetry instrumentation so you can trace logins, grants, and logouts in production.',
    accent: 'text-rose-400',
  },
  {
    icon: Workflow,
    title: 'Standalone or embedded',
    body: 'Topology-agnostic: host it as a dedicated IdP, or embed the server kit directly inside an existing AdonisJS app. Eject when you outgrow it.',
    accent: 'text-teal-400',
  },
];

function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything an IdP needs, one kit
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Server, client, and shared core — the full identity surface for AdonisJS, with one
          consistent mental model.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  const inner = (
    <div className="group relative overflow-hidden rounded-xl border border-fd-border bg-fd-card/50 p-5 backdrop-blur transition-colors hover:border-[#625fff]/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(120px circle at top right, rgb(98 95 255 / 0.1), transparent 70%)',
        }}
      />
      <div className="relative">
        <span className="inline-flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-background/60">
          <Icon className={`size-4.5 ${feature.accent}`} />
        </span>
        <h3 className="mt-4 font-medium">{feature.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{feature.body}</p>
      </div>
    </div>
  );

  return feature.href ? (
    <Link href={feature.href} className="block no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/* -------------------------------------------------------------------------- */
/*  Wire it in — config snippet with window chrome                             */
/* -------------------------------------------------------------------------- */

const CODE_LINES: readonly { tokens: { text: string; cls?: string }[] }[] = [
  {
    tokens: [
      { text: 'import', cls: 'text-[#9a8bff]' },
      { text: ' { defineConfig } ' },
      { text: 'from', cls: 'text-[#9a8bff]' },
      { text: " '@adonis-agora/authkit-server'", cls: 'text-teal-300' },
    ],
  },
  { tokens: [] },
  {
    tokens: [
      { text: 'export default', cls: 'text-[#9a8bff]' },
      { text: ' ' },
      { text: 'defineConfig', cls: 'text-sky-400' },
      { text: '({' },
    ],
  },
  {
    tokens: [
      { text: '  issuer', cls: 'text-amber-300' },
      { text: ': ' },
      { text: "'https://auth.acme.dev'", cls: 'text-teal-300' },
      { text: ',' },
    ],
  },
  {
    tokens: [
      { text: '  mfa', cls: 'text-amber-300' },
      { text: ': { ' },
      { text: 'totp', cls: 'text-amber-300' },
      { text: ': ' },
      { text: 'true', cls: 'text-[#9a8bff]' },
      { text: ' },' },
      { text: '   // enable second factor', cls: 'text-zinc-600' },
    ],
  },
  {
    tokens: [
      { text: '  audit', cls: 'text-amber-300' },
      { text: ': ' },
      { text: 'true', cls: 'text-[#9a8bff]' },
      { text: ',' },
    ],
  },
  {
    tokens: [
      { text: '  admin', cls: 'text-amber-300' },
      { text: ': { ' },
      { text: 'enabled', cls: 'text-amber-300' },
      { text: ': ' },
      { text: 'true', cls: 'text-[#9a8bff]' },
      { text: ' },' },
      { text: ' // React SPA console', cls: 'text-zinc-600' },
    ],
  },
  { tokens: [{ text: '})' }] },
];

function WireItIn() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-fd-primary">
            Wire it in
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            One config. That&apos;s the install.
          </h2>
          <p className="mt-4 text-fd-muted-foreground">
            Register the{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">server</code> kit,
            point it at your issuer URL, and you have a working OIDC provider with admin console.
            Add the{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">react</code>{' '}
            package for Clerk-style components and typed hooks in any AdonisJS app. Eject the
            internals whenever you need full control.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/docs/getting-started"
              className="inline-flex items-center gap-2 font-medium text-fd-primary transition-colors hover:opacity-80"
            >
              Full setup guide
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/docs/react"
              className="inline-flex items-center gap-2 font-medium text-[#9a8bff] transition-colors hover:opacity-80"
            >
              React package
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-xl shadow-black/30 ring-1 ring-white/5">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-2.5">
            <Terminal className="size-3.5 text-zinc-500" />
            <span className="font-mono text-xs text-zinc-500">config/authkit.ts</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>
              {CODE_LINES.map((line, lineIndex) => (
                <div key={lineIndex} className="whitespace-pre">
                  {line.tokens.map((token, tokenIndex) => (
                    <span key={tokenIndex} className={token.cls ?? 'text-zinc-300'}>
                      {token.text}
                    </span>
                  ))}
                  {line.tokens.length === 0 ? ' ' : null}
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA                                                                   */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-28">
      <div className="relative overflow-hidden rounded-2xl border border-fd-border bg-fd-card/60 px-6 py-14 text-center backdrop-blur">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse 60% 100% at 50% 0%, rgb(98 95 255 / 0.14), transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.4]"
          style={{
            backgroundImage:
              'radial-gradient(circle at center, var(--color-fd-border) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 50% 50%, black, transparent 80%)',
          }}
        />
        <span className="inline-flex items-center gap-2 font-mono text-xs text-fd-primary">
          <Lock className="size-4" />
          <KeyRound className="size-4" />
          <Fingerprint className="size-4" />
        </span>
        <h2 className="mx-auto mt-4 max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Stop bolting auth on by hand.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-fd-muted-foreground">
          Drop in a real OpenID Connect provider, get MFA, admin console, React components, typed
          hooks, and audit for free — ship identity to production with confidence.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-lg bg-[#625fff] px-6 py-2.5 font-medium text-white shadow-[0_0_24px_-6px] shadow-[#625fff]/50 transition-all hover:bg-[#7773ff] hover:shadow-[#7773ff]/60"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={GITHUB_URL}
            className="rounded-lg border border-fd-border bg-fd-background/40 px-6 py-2.5 font-medium transition-colors hover:bg-fd-accent"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
