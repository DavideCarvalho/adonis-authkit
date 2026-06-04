import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-2xl">
        <h1 className="mb-4 text-5xl font-bold tracking-tight">AuthKit</h1>
        <p className="mb-2 text-xl text-fd-muted-foreground">
          OIDC Authorization Server for AdonisJS
        </p>
        <p className="mb-8 text-fd-muted-foreground">
          A drop-in OpenID Connect provider plus a client kit — PAT, impersonation,
          MFA, audit, and RP-initiated logout, deployable standalone or embedded.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Read the docs
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-lg border border-fd-border px-5 py-2.5 font-medium transition-colors hover:bg-fd-accent"
          >
            Getting started
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-sm text-fd-muted-foreground">
          <code className="rounded bg-fd-muted px-2 py-1">@dudousxd/adonis-authkit-server</code>
          <code className="rounded bg-fd-muted px-2 py-1">@dudousxd/adonis-authkit-client</code>
          <code className="rounded bg-fd-muted px-2 py-1">@dudousxd/adonis-authkit-core</code>
        </div>
      </div>
    </main>
  )
}
