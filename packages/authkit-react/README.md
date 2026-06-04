# @dudousxd/adonis-authkit-react

Ergonomia de frontend sobre o AuthKit para apps **AdonisJS + Inertia + React**:
um `useAuth()` tipado, helpers de papéis e componentes de gating.

Este pacote **não** faz autenticação — ele consome o estado de auth que o host
AdonisJS já resolveu (via `@dudousxd/adonis-authkit-client`) e compartilhou como
uma shared-prop do Inertia.

## Instalação

```bash
pnpm add @dudousxd/adonis-authkit-react
```

`react`, `react-dom` e `@inertiajs/react` são **peer dependencies** (o app os fornece).

## 1. No host AdonisJS: compartilhar a prop `authkit`

A shared-prop tem o formato `AuthSharedProps`. Use `auth.getUser()` /
`auth.identity` do `@dudousxd/adonis-authkit-client` para preenchê-la — tipicamente
num middleware ou no `config/inertia.ts` (`sharedData`):

```ts
// config/inertia.ts
import { defineConfig } from '@adonisjs/inertia'

export default defineConfig({
  sharedData: {
    authkit: async (ctx) => {
      const auth = ctx.authkit // sua instância do Authenticator
      const user = await auth.getUser() // mesmo shape de identityToUser/resolveUser
      return {
        user: user ?? null,
        globalRoles: auth.identity?.globalRoles ?? [],
        // appRoles opcional, se o host resolver papéis de app
      }
    },
  },
})
```

O objeto `user` deve corresponder ao tipo `AuthUser`:
`{ id, email, name?, avatarUrl?, globalRoles, appRoles? }` — exatamente a saída de
`identityToUser`/`resolveUser` do client.

## 2. No frontend: `useAuth()`

```tsx
import { useAuth } from '@dudousxd/adonis-authkit-react'

function Header() {
  const { user, isAuthenticated, hasGlobalRole } = useAuth()

  if (!isAuthenticated) return <a href="/login">Entrar</a>

  return (
    <div>
      Olá, {user!.name ?? user!.email}
      {hasGlobalRole('ADMIN') && <a href="/admin">Admin</a>}
    </div>
  )
}
```

`useAuth()` nunca lança quando a prop está ausente: retorna estado
não-autenticado (`user: null`, listas vazias).

## 3. Componentes de gating

```tsx
import { Authenticated, Guest, Can } from '@dudousxd/adonis-authkit-react'

<Authenticated fallback={<LoginButton />}>
  <Dashboard />
</Authenticated>

<Guest>
  <MarketingBanner />
</Guest>

{/* papel global único */}
<Can role="ADMIN">
  <AdminPanel />
</Can>

{/* exige todos os papéis */}
<Can roles={['ADMIN', 'BILLING']} mode="all" fallback={<NoAccess />}>
  <BillingSettings />
</Can>

{/* papel específico do app */}
<Can role="EDITOR" appRole>
  <EditButton />
</Can>
```

## 4. `AuthProvider` (opcional)

Fora do Inertia (testes, Storybook), injete o valor manualmente. O contexto tem
precedência sobre as page props quando presente:

```tsx
import { AuthProvider } from '@dudousxd/adonis-authkit-react'

<AuthProvider value={{ user, globalRoles: user.globalRoles }}>
  <App />
</AuthProvider>
```

## Helpers puros

Para uso fora de componentes, as funções de papéis são exportadas e livres de React:

```ts
import { hasGlobalRole, hasAnyGlobalRole, hasAllGlobalRoles, hasAppRole } from '@dudousxd/adonis-authkit-react'

hasGlobalRole(user, 'ADMIN')
hasAnyGlobalRole(user, ['ADMIN', 'TEACHER'])
```
