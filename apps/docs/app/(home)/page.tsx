import Link from 'next/link'
import {
  ArrowRight,
  Fingerprint,
  KeyRound,
  Lock,
  ScrollText,
  ShieldCheck,
  Terminal,
  UserCog,
  Workflow,
} from 'lucide-react'

const GITHUB_URL = 'https://github.com/DavideCarvalho/adonis-authkit'

export default function HomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <BackgroundTexture />
      <Hero />
      <ConsolePreview />
      <FeatureGrid />
      <WireItIn />
      <FinalCta />
    </main>
  )
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
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, black 20%, transparent 75%)',
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
  )
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
          A complete identity provider, {' '}
          <span className="bg-gradient-to-r from-[#625fff] to-[#9a8bff] bg-clip-text text-transparent">
            dropped into your app.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-lg text-fd-muted-foreground">
          A drop-in OpenID Connect authorization server plus a client kit —
          personal access tokens, impersonation, MFA, audit logging, and
          RP-initiated logout. Run it standalone as a hosted IdP, or embed it
          right inside your AdonisJS app.
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
            npm i <span className="text-fd-primary">@dudousxd/adonis-authkit-server</span>
          </span>
        </div>

        <p className="mt-6 font-mono text-xs text-fd-muted-foreground">
          3 packages on npm · standalone or embedded · OTel-instrumented
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Console preview — faithful reproduction of the shipped host-kit screens:    */
/*  the IdP login (login.edge) + the admin audit log (admin/audit.edge),        */
/*  with the real pt-BR i18n labels and the real audit event types we emit.     */
/* -------------------------------------------------------------------------- */

interface AuditRow {
  type: string
  typeColor: string
  detail: string
  time: string
}

// Real event types emitted by the host kit (see authkit-server emitters).
const AUDIT_ROWS: readonly AuditRow[] = [
  {
    type: 'login.success',
    typeColor: 'text-emerald-400',
    detail: 'jane@acme.dev · acc_8f3a · web-app · 187.0.12.4',
    time: '2 min ago',
  },
  {
    type: 'mfa.enabled',
    typeColor: 'text-sky-400',
    detail: 'jane@acme.dev · acc_8f3a · 187.0.12.4',
    time: '14 min ago',
  },
  {
    type: 'pat.issued',
    typeColor: 'text-amber-400',
    detail: 'ci-runner · acc_2b1c · 10.0.4.7',
    time: '1 h ago',
  },
  {
    type: 'client.created',
    typeColor: 'text-[#9a8bff]',
    detail: 'mobile-app · acc_1a9f · 187.0.12.4',
    time: '3 h ago',
  },
  {
    type: 'session.revoked_all',
    typeColor: 'text-rose-400',
    detail: 'sam@acme.dev · acc_77de · 201.55.9.2',
    time: '5 h ago',
  },
  {
    type: 'login.failure',
    typeColor: 'text-zinc-400',
    detail: 'sam@acme.dev · 201.55.9.2',
    time: 'ontem',
  },
]

function ConsolePreview() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="relative">
        <div
          aria-hidden
          className="absolute -inset-x-10 -bottom-8 top-10 -z-10 rounded-[2rem] bg-[#625fff]/10 blur-3xl"
        />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <LoginScreenMock />
          <AdminAuditMock />
        </div>

        <p className="mt-5 text-center font-mono text-xs text-fd-muted-foreground">
          Real host-kit screens: login + admin console
        </p>
      </div>
    </section>
  )
}

/* Faithful reproduction of packages/authkit-server/src/host/views/login.edge   */
function LoginScreenMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-2xl shadow-black/40 ring-1 ring-white/5 lg:mt-8">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-3">
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="ml-3 truncate font-mono text-xs text-zinc-500">
          auth.acme.dev · /auth/interaction
        </span>
      </div>

      {/* the login card itself (card markup mirrors login.edge) */}
      <div className="bg-[#0d0d10] p-6">
        <div className="mx-auto w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#16161b]/60 p-6 ring-1 ring-white/5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9a8bff]">
            Acme
          </p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-100">Login</h3>
          <p className="mt-1 text-sm text-zinc-500">Enter your email to continue.</p>

          <div className="mt-5">
            <label className="mb-1 block text-sm font-medium text-zinc-300">Email</label>
            <div className="w-full rounded-lg border border-zinc-700 bg-[#0d0d10] px-3 py-2 text-sm text-zinc-300">
              jane@acme.dev
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-zinc-300">Password</label>
            <div className="w-full rounded-lg border border-zinc-700 bg-[#0d0d10] px-3 py-2 text-sm tracking-widest text-zinc-500">
              ••••••••••
            </div>
          </div>

          <div className="mt-5 w-full rounded-lg bg-[#625fff] py-2.5 text-center text-sm font-semibold text-white">
            Log in
          </div>

          <div className="mt-4 flex justify-between text-sm text-zinc-500">
            <span className="hover:underline">Create account</span>
            <span className="hover:underline">Forgot password</span>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-600">
            <span className="h-px flex-1 bg-zinc-800" />
            or
            <span className="h-px flex-1 bg-zinc-800" />
          </div>

          <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-[#0d0d10] py-2.5 text-sm font-medium text-zinc-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75Z"
              />
            </svg>
            Sign in with Google
          </div>
        </div>
      </div>
    </div>
  )
}

/* Faithful reproduction of packages/authkit-server/src/host/views/admin/audit.edge */
function AdminAuditMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-2xl shadow-black/40 ring-1 ring-white/5">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-3">
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="size-3 rounded-full bg-zinc-700" />
        <span className="ml-3 font-mono text-xs text-zinc-500">auth.acme.dev · /admin/audit</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-[#9a8bff]">
          <span className="animate-ak-blink size-1.5 rounded-full bg-[#9a8bff]" />
          live
        </span>
      </div>

      <div className="bg-[#0d0d10] p-5">
        {/* header: eyebrow + title (mirrors admin/audit.edge) */}
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Auth
          </div>
          <h3 className="text-lg font-semibold text-zinc-100">Audit log</h3>
        </div>

        {/* admin nav */}
        <nav className="mb-4 flex gap-4 text-sm font-medium">
          <span className="text-zinc-500">Dashboard</span>
          <span className="text-zinc-500">Users</span>
          <span className="text-zinc-500">Clients</span>
          <span className="text-zinc-100 underline">Audit</span>
        </nav>

        {/* filter form */}
        <div className="mb-4 flex gap-2">
          <div className="flex-1 rounded-lg border border-zinc-700 bg-[#16161b]/60 px-3 py-2 text-sm text-zinc-600">
            Filter by type
          </div>
          <div className="flex-1 rounded-lg border border-zinc-700 bg-[#16161b]/60 px-3 py-2 text-sm text-zinc-600">
            Filter by subject (accountId)
          </div>
          <div className="rounded-lg bg-[#625fff] px-4 py-2 text-sm font-semibold text-white">
            Filter
          </div>
        </div>

        {/* events list (each row = type + createdAt, then detail line) */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#16161b]/40">
          {AUDIT_ROWS.map((row) => (
            <div key={row.type + row.time} className="border-b border-zinc-800/80 p-4 last:border-0">
              <div className="flex items-center justify-between">
                <p className={`font-mono text-sm font-medium ${row.typeColor}`}>{row.type}</p>
                <p className="text-xs text-zinc-600">{row.time}</p>
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-500">{row.detail}</p>
            </div>
          ))}
        </div>

        {/* pagination */}
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>Page 1 of 8</span>
          <div className="flex gap-2">
            <span className="rounded border border-zinc-700 px-3 py-1">Previous</span>
            <span className="rounded border border-zinc-700 px-3 py-1">Next</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feature grid                                                                */
/* -------------------------------------------------------------------------- */

interface Feature {
  icon: typeof KeyRound
  title: string
  body: string
  accent: string
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
    icon: Terminal,
    title: 'Admin API & SDK',
    body: 'A versioned admin REST API (users, clients, sessions, audit) secured by API keys, plus a typed SDK that runs remote or in-process.',
    accent: 'text-indigo-400',
  },
  {
    icon: KeyRound,
    title: 'Personal access tokens',
    body: 'Long-lived, scoped tokens for CI and machine clients, issued and revoked through the same kit your users authenticate against.',
    accent: 'text-amber-400',
  },
  {
    icon: UserCog,
    title: 'Impersonation & admin',
    body: 'Safely act-as another user for support, with a full admin surface and dynamic client registration built in.',
    accent: 'text-emerald-400',
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
]

function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-24">
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Everything an IdP needs, one kit
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-fd-muted-foreground">
          Server, client, and shared core — the full identity surface for
          AdonisJS, with one consistent mental model.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon
  return (
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
  )
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
      { text: " '@dudousxd/adonis-authkit-server'", cls: 'text-teal-300' },
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
  { tokens: [{ text: '})' }] },
]

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
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">server</code>{' '}
            kit, point it at your issuer URL, and you have a working OIDC
            provider. Add the{' '}
            <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">client</code>{' '}
            kit to any AdonisJS app to consume it. Eject the internals whenever
            you need full control.
          </p>
          <Link
            href="/docs/getting-started"
            className="mt-6 inline-flex items-center gap-2 font-medium text-fd-primary transition-colors hover:opacity-80"
          >
            Full setup guide
            <ArrowRight className="size-4" />
          </Link>
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
  )
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
          Drop in a real OpenID Connect provider, get MFA, PATs and audit for
          free, and ship identity to production with confidence.
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
  )
}
