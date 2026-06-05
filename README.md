# AuthKit for AdonisJS

AuthKit is a set of packages that turn an [AdonisJS](https://adonisjs.com) app into
a full **OpenID Connect / OAuth2 Authorization Server** (Identity Provider), let other
apps consume it as **OIDC clients**, and give React frontends typed auth ergonomics.

It is built as an idiomatic wrapper around
[`oidc-provider`](https://github.com/panva/node-oidc-provider).

## Features

- **OIDC / OAuth2 Authorization Server** — authorization code + PKCE, refresh tokens,
  token exchange, discovery, JWKS, revocation, introspection.
- **MFA** — TOTP, WebAuthn passkeys, recovery codes, and trusted-device skip.
- **Passwordless** — magic-link email login and passkey-first login.
- **Protocol extensions** — Device Flow (RFC 8628), DPoP (RFC 9449, with client-side
  proof generation), PAR (RFC 9126), step-up auth via `acr_values`, Dynamic Client
  Registration (RFC 7591/7592).
- **Consoles** — admin console (user & client CRUD, sessions, audit) and a self-service
  account console (apps/consent, security, profile).
- **Tokens & sessions** — Personal Access Tokens, admin impersonation, back-channel
  logout, RP-initiated logout.
- **Hardening** — progressive account lockout, per-IP rate-limiting, audit logging with
  an events/webhook fan-out, new-login email alerts.
- **Operability** — i18n (English + pt-BR built in), OpenTelemetry metrics, `authkit:doctor`
  and `authkit:rotate-keys` commands, and a `@dudousxd/adonis-authkit-testing` helper package.
- **Client & React** — typed OIDC client resolvers (JWT/opaque/PAT) and a React
  `useAuth()` hook with role-gating components.

## Packages

| Package | Description |
| --- | --- |
| [`@dudousxd/adonis-authkit-core`](./packages/authkit-core) | Shared contracts and types (`Identity`, `SessionResolver`, server config types, metric names). No runtime — consumed by the server and client packages. |
| [`@dudousxd/adonis-authkit-server`](./packages/authkit-server) | AdonisJS OIDC/OAuth2 Authorization Server (Identity Provider): ejectable auth server with sessions, rate-limiting, MFA/TOTP, audit log, federated logout, and OpenTelemetry metrics. |
| [`@dudousxd/adonis-authkit-client`](./packages/authkit-client) | OIDC relying-party (client) adapter: session-based authentication against an OpenID Connect identity provider, with JWT/PAT user resolvers and OpenTelemetry metrics. |
| [`@dudousxd/adonis-authkit-react`](./packages/authkit-react) | Frontend ergonomics for AdonisJS + Inertia + React apps: a typed `useAuth()` hook, role-gating hooks, and gating components. |

## Install

Run the Authorization Server in your IdP app:

```bash
node ace add @dudousxd/adonis-authkit-server
```

Consume it from a client app:

```bash
node ace add @dudousxd/adonis-authkit-client
```

Add the React ergonomics to an Inertia + React frontend:

```bash
pnpm add @dudousxd/adonis-authkit-react
```

`@dudousxd/adonis-authkit-core` is pulled in transitively by the server and client
packages — you rarely install it directly.

## Documentation

Full documentation lives at the docs site (coming soon). Each package also ships its
own README with setup and usage details:

- [authkit-server README](./packages/authkit-server/README.md)
- [authkit-client README](./packages/authkit-client/README.md)
- [authkit-react README](./packages/authkit-react/README.md)
- [authkit-core README](./packages/authkit-core/README.md)

## Development

This is a pnpm monorepo. Common tasks:

```bash
pnpm install
pnpm build       # build all packages
pnpm typecheck   # typecheck all packages
pnpm test        # run all package test suites
pnpm format      # prettier --write
```

Releases are managed with [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset           # record a version bump
pnpm release             # build + changeset publish
```

## License

[MIT](./LICENSE) © Davi de Carvalho
