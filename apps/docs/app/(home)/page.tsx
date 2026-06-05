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
/*  Console preview — a faithful OIDC console mock in AdonisJS woodsmoke        */
/* -------------------------------------------------------------------------- */

interface EventRow {
  type: string
  typeColor: string
  dot: string
  label: string
  status: string
  statusColor: string
  detail: string
}

const EVENT_ROWS: readonly EventRow[] = [
  {
    type: 'authorize',
    typeColor: 'text-[#9a8bff]',
    dot: 'bg-[#9a8bff]',
    label: 'GET /oauth/authorize · client web-app',
    status: '302',
    statusColor: 'text-emerald-400',
    detail: 'PKCE S256',
  },
  {
    type: 'token',
    typeColor: 'text-emerald-400',
    dot: 'bg-emerald-400',
    label: 'POST /oauth/token · grant authorization_code',
    status: '200',
    statusColor: 'text-emerald-400',
    detail: 'access + id_token',
  },
  {
    type: 'mfa',
    typeColor: 'text-sky-400',
    dot: 'bg-sky-400',
    label: 'TOTP challenge · jane@acme.dev',
    status: 'pass',
    statusColor: 'text-sky-300',
    detail: '2nd factor',
  },
  {
    type: 'pat',
    typeColor: 'text-amber-400',
    dot: 'bg-amber-400',
    label: 'Personal access token · ci-runner',
    status: 'issued',
    statusColor: 'text-amber-300',
    detail: 'scope: read',
  },
  {
    type: 'logout',
    typeColor: 'text-rose-400',
    dot: 'bg-rose-400',
    label: 'RP-initiated logout · end_session',
    status: '204',
    statusColor: 'text-rose-300',
    detail: 'session cleared',
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
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0d10] shadow-2xl shadow-black/40 ring-1 ring-white/5">
          {/* window chrome */}
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-[#16161b]/80 px-4 py-3">
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="size-3 rounded-full bg-zinc-700" />
            <span className="ml-3 font-mono text-xs text-zinc-500">authkit · /audit</span>
            <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] text-[#9a8bff]">
              <span className="animate-ak-blink size-1.5 rounded-full bg-[#9a8bff]" />
              live
            </span>
          </div>

          <div className="grid gap-px bg-zinc-800/60 lg:grid-cols-[1.7fr_1fr]">
            {/* audit table */}
            <div className="bg-[#0d0d10] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase tracking-wide text-[#9a8bff]">
                  Recent auth events
                </h3>
                <span className="font-mono text-[10px] text-zinc-600">tenant · acme</span>
              </div>
              <div className="space-y-px font-mono text-xs">
                {EVENT_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="group flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[#16161b]"
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${row.dot}`} />
                    <span className={`w-20 shrink-0 ${row.typeColor}`}>{row.type}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-300">{row.label}</span>
                    <span className="hidden shrink-0 text-zinc-500 sm:block">{row.detail}</span>
                    <span className={`w-16 shrink-0 text-right ${row.statusColor}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* side rail: discovery + token claims */}
            <div className="flex flex-col gap-4 bg-[#0d0d10] p-4">
              <div>
                <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-zinc-400">
                  Provider
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <MockStat label="Flows" value="OIDC" accent="text-[#9a8bff]" />
                  <MockStat label="MFA" value="TOTP" accent="text-sky-400" />
                  <MockStat label="Tokens" value="JWT" accent="text-emerald-400" />
                  <MockStat label="Topology" value="embed" accent="text-amber-400" />
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-[#16161b]/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">
                    id_token claims
                  </span>
                  <span className="font-mono text-[10px] text-[#9a8bff]">verified</span>
                </div>
                <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-zinc-400">
                  <code>{`{
  "sub": "usr_8f3a",
  "email": "jane@acme.dev",
  "amr": ["pwd","otp"],
  "scope": "openid profile"
}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MockStat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-[#16161b]/60 px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${accent}`}>{value}</p>
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
    title: 'MFA & WebAuthn',
    body: 'TOTP second factor, passkeys, lockout protection, and account linking — strong auth without wiring it together yourself.',
    accent: 'text-sky-400',
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
