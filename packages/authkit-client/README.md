# @dudousxd/adonis-authkit-client

Adapter consumidor OpenID Connect para AdonisJS — integra um app como client do
Authorization Server (`@dudousxd/adonis-authkit-server`), validando o ID token localmente por JWKS.

## Instalação
```bash
node ace add @dudousxd/adonis-authkit-client
# ou: pnpm add @dudousxd/adonis-authkit-client && node ace configure @dudousxd/adonis-authkit-client
```
O `configure` publica `config/authkit_client.ts`, o controller `app/controllers/oidc_session_controller.ts`
(login/callback/logout) e registra o provider + o middleware `authkit_middleware`.

## Rotas de sessão
```ts
// start/routes.ts
import OidcSessionController from '#controllers/oidc_session_controller'
router.get('/auth/login', [OidcSessionController, 'login'])
router.get('/auth/callback', [OidcSessionController, 'callback'])
router.post('/auth/logout', [OidcSessionController, 'logout'])
```
`AUTHKIT_REDIRECT_URI` deve apontar para a rota de callback.

## Uso por request
`ctx.auth` é populado pelo `authkit_middleware`:
```ts
const identity = await ctx.auth.getIdentity()   // claims OIDC validadas (ou null)
const user = await ctx.auth.getUser()            // model do app (via resolveUser)
ctx.auth.hasGlobalRole('ADMIN')                  // síncrono, das claims
await ctx.auth.hasAppRole('COORDINATOR')         // via resolveAppRoles
```

## Resolução de sessão
`resolvers.jwt({ tokenSource })` valida o **ID token** (JWT) por JWKS:
- `tokenSource: 'session'` (default) — lê o token set do `@adonisjs/session`.
- `tokenSource: 'bearer'` — lê do header `Authorization` (SPA/API).

## Topologias de banco
A identidade (`ctx.auth.identity`) sempre vem do **token validado** e independe da
topologia de banco. O que muda é como `resolveUser` obtém o model do app.

### Mesmo banco + schemas
O app lê um model Lucid local mapeado pra `auth.users` (FK cross-schema):
```ts
// config/authkit_client.ts
resolveUser: async (identity) => {
  // FK cross-schema: app.users.auth_user_id -> auth.users.id
  return AppUser.query().where('authUserId', identity.userId).firstOrFail()
},
resolveAppRoles: async (identity) => {
  const u = await AppUser.findByOrFail('authUserId', identity.userId)
  return u.related('roles').query().then((rs) => rs.map((r) => r.name))
},
```

### Bancos separados
Sem FK cross-schema possível. Como o IdP emite um **ID token "gordo"**
(email/name/roles nas claims), o caminho recomendado é claims-only:
```ts
import { identityToUser } from '@dudousxd/adonis-authkit-client'

resolveUser: identityToUser, // { id, email, name?, avatarUrl?, globalRoles }
```
Pra dados além do que o token carrega, use o resolver de userinfo (busca no
endpoint `${issuer}/me` com o access token; faz fallback pra claims sem token):
```ts
import { createUserinfoResolver } from '@dudousxd/adonis-authkit-client'

resolveUser: createUserinfoResolver({ issuer: env.get('AUTHKIT_ISSUER') }),
// ou: createUserinfoResolver({ userinfoEndpoint: 'https://idp/me' })
```
Em ambos os casos, `resolveAppRoles` **sempre consulta o banco do próprio app**:
```ts
resolveAppRoles: async (identity) => {
  const roles = await AppRole.query().where('authUserId', identity.userId)
  return roles.map((r) => r.name)
},
```

## Ordem de middleware (importante)
O middleware do `@adonisjs/session` DEVE rodar ANTES do `authkit_middleware` no stack `router`
(o resolver lê o token da session). Garanta essa ordem em `start/kernel.ts`.

## Observabilidade (opcional)
O `Authenticator` registra métricas de resolução (`authkit.resolve.duration` e
`authkit.resolve.errors`) quando um `MetricsRecorder` é injetado. As métricas são emitidas via
OpenTelemetry **quando** `@opentelemetry/api` está instalado; sem ele a agregação é no-op.
O comportamento por request não muda — observabilidade é puramente aditiva.
