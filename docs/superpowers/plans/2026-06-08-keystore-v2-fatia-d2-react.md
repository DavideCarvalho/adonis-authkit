# Keystore v2 — Fatia D2 (React SDK: client + headless TanStack + componente) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor a gestão de rotação de chave JWKS no `@adonis-agora/authkit-react`: método tipado `client.admin.keys.{status,rotate}` (console API session-authed), hooks headless TanStack (`useKeysQueryOptions`/`useRotateKeysMutationOptions`), e um componente `<KeyRotation>`. Tudo consome a **Console JSON API** (`{adminBase}/api/keys`) entregue na Fatia D1 — sem API key no browser.

**Architecture:** Mirror exato dos padrões existentes do `authkit-react`: tipos em `client/types.ts`, recurso `admin.keys` no `AuthkitClient` (`client.ts`), query key em `queries/keys.ts`, hooks options-object em `queries/admin/index.ts`, componente `createElement`+BEM em `components/`. O componente usa `useQuery`/`useMutation` com os hooks headless e invalida o cache no sucesso. A política (`enabled/maxAgeDays/keep`) é salva via o recurso de settings genérico já existente (`client.admin.settings`).

**Tech Stack:** TypeScript, React, `@tanstack/react-query` (já peer do package).

**Pré-requisito (em `main`):** Fatia D1 — a Console JSON API `GET/POST {adminBase}/api/keys` (session+role) já existe.

**Escopo:** SÓ o `authkit-react` (+ os tipos que ele consome). O servidor já está pronto (D1). Fecha a Fatia D inteira.

**Comandos:**
```bash
cd packages/authkit-react
npx tsc --noEmit          # typecheck
npm run build             # confirma que o build sai
# se houver test runner (cheque package.json scripts), rodar a suíte do package
```

---

## File Structure

**Modificar:**
- `packages/authkit-react/src/client/types.ts` — `KeysStatus`, `KeysRotateInput`, `KeysRotateResult`.
- `packages/authkit-react/src/client/client.ts` — `admin.keys = { status, rotate }`; import dos novos tipos.
- `packages/authkit-react/src/queries/keys.ts` — `authkitKeys.admin.keys()`.
- `packages/authkit-react/src/queries/admin/index.ts` — `useKeysQueryOptions()`, `useRotateKeysMutationOptions()`.
- `packages/authkit-react/index.ts` (barrel) — exportar o componente novo (os hooks de `queries/admin` e o client já são exportados via os barrels existentes — confirmar).

**Criar:**
- `packages/authkit-react/src/components/key_rotation.tsx` — `<KeyRotation>`.

---

## Task 1: Tipos `KeysStatus` / `KeysRotateInput` / `KeysRotateResult`

**Files:** Modify `packages/authkit-react/src/client/types.ts`

- [ ] **Step 1:** No fim de `src/client/types.ts` (junto dos outros tipos Admin), adicione:
```ts
// ---------------------------------------------------------------------------
// Admin — Key rotation (JWKS signing keys)
// ---------------------------------------------------------------------------

/** Status da chave de assinatura managed (GET {base}/keys). */
export interface KeysStatus {
  /** Idade em dias da chave de assinatura corrente. */
  ageDays: number
  /** Política de rotação efetiva. */
  policy: { enabled: boolean; maxAgeDays: number; keep: number }
  /** Dias até a próxima rotação automática (null quando a política está desligada). */
  nextRotationInDays: number | null
}

/** Body de POST {base}/keys/rotate. */
export interface KeysRotateInput {
  /** Aposenta TODAS as chaves antigas de imediato (sem período de graça). Default false. */
  retire?: boolean
  /** Quantas chaves manter no JWKS (default 2). */
  keep?: number
}

/** Resultado de uma rotação. */
export interface KeysRotateResult {
  rotated: true
  newKid: string
  retiredKids: string[]
  keptKids: string[]
}
```

- [ ] **Step 2:** Typecheck + commit
```bash
cd packages/authkit-react && npx tsc --noEmit
git add packages/authkit-react/src/client/types.ts
git commit -m "feat(react): tipos KeysStatus/KeysRotateInput/KeysRotateResult"
```

---

## Task 2: Recurso `admin.keys` no `AuthkitClient`

**Files:** Modify `packages/authkit-react/src/client/client.ts`

- [ ] **Step 1: READ** `src/client/client.ts` — o objeto `readonly admin = { users: {...}, ..., settings: {...}, impersonation: {...} }`, e os helpers `this.b(path)` (admin base URL), `this.get/post`. Veja o bloco `settings:` como referência.

- [ ] **Step 2:** Adicione os tipos ao import de tipos no topo (junto de `SettingListResult` etc.):
```ts
  KeysStatus,
  KeysRotateInput,
  KeysRotateResult,
```

- [ ] **Step 3:** Dentro do objeto `admin`, após o recurso `settings` (ou `impersonation`), adicione:
```ts
    /** Rotação de chave de assinatura JWKS (console API, session-authed). */
    keys: {
      /** GET {base}/keys — idade, política e ETA da próxima rotação. */
      status: () => this.get<KeysStatus>(this.b('/keys')),
      /** POST {base}/keys/rotate — rotaciona agora (opcionalmente aposenta as antigas). */
      rotate: (input?: KeysRotateInput) => this.post<KeysRotateResult>(this.b('/keys/rotate'), input ?? {}),
    },
```
Confirme a assinatura de `this.post` (alguns aceitam `(url, body)`); mirror o uso em `settings`/`users.create`. Mantenha a vírgula/estilo consistente com os recursos vizinhos.

- [ ] **Step 4:** Typecheck + commit
```bash
cd packages/authkit-react && npx tsc --noEmit
git add packages/authkit-react/src/client/client.ts
git commit -m "feat(react): client.admin.keys.{status,rotate} (console API)"
```

---

## Task 3: Query key `authkitKeys.admin.keys()`

**Files:** Modify `packages/authkit-react/src/queries/keys.ts`

- [ ] **Step 1:** Em `src/queries/keys.ts`, dentro de `authkitKeys.admin` (junto de `settings`/`impersonation`), adicione:
```ts
    keys: () => ['authkit', 'admin', 'keys'] as const,
```

- [ ] **Step 2:** Typecheck + commit
```bash
cd packages/authkit-react && npx tsc --noEmit
git add packages/authkit-react/src/queries/keys.ts
git commit -m "feat(react): authkitKeys.admin.keys query key"
```

---

## Task 4: Hooks headless TanStack (`useKeysQueryOptions` / `useRotateKeysMutationOptions`)

**Files:** Modify `packages/authkit-react/src/queries/admin/index.ts`

- [ ] **Step 1: READ** `src/queries/admin/index.ts` — o padrão: `useXQueryOptions()` retorna `{ queryKey, queryFn } satisfies UseQueryOptions<Result, AuthkitClientError>`; `useXMutationOptions()` retorna `{ mutationKey, mutationFn } satisfies UseMutationOptions<Result, AuthkitClientError, Input>`. Veja `useOverviewQueryOptions` e `useCreateUserMutationOptions` como templates. Confirme os imports (`useAuthkitClient`, `authkitKeys`, `AuthkitClientError`, os tipos `UseQueryOptions`/`UseMutationOptions`).

- [ ] **Step 2:** Adicione os imports de tipo necessários (`KeysStatus`, `KeysRotateInput`, `KeysRotateResult`) de onde os outros tipos admin são importados nesse arquivo, e adicione os hooks:
```ts
/**
 * Status da chave de assinatura managed (idade, política, ETA da próxima rotação).
 * Consumidor: `const q = useQuery(useKeysQueryOptions())`.
 */
export function useKeysQueryOptions() {
  const client = useAuthkitClient()
  return {
    queryKey: authkitKeys.admin.keys(),
    queryFn: () => client.admin.keys.status(),
  } satisfies UseQueryOptions<KeysStatus, AuthkitClientError>
}

/**
 * Rotaciona a chave de assinatura AGORA (aplica ao vivo no servidor). No sucesso,
 * invalide `authkitKeys.admin.keys()` p/ refletir a nova idade/kid.
 * Consumidor: `const m = useMutation(useRotateKeysMutationOptions())`.
 */
export function useRotateKeysMutationOptions() {
  const client = useAuthkitClient()
  return {
    mutationKey: ['authkit', 'admin', 'keys', 'rotate'],
    mutationFn: (input?: KeysRotateInput) => client.admin.keys.rotate(input),
  } satisfies UseMutationOptions<KeysRotateResult, AuthkitClientError, KeysRotateInput | undefined>
}
```

- [ ] **Step 3:** Typecheck + commit
```bash
cd packages/authkit-react && npx tsc --noEmit
git add packages/authkit-react/src/queries/admin/index.ts
git commit -m "feat(react): useKeysQueryOptions + useRotateKeysMutationOptions (headless TanStack)"
```

---

## Task 5: Componente `<KeyRotation>`

**Files:** Create `packages/authkit-react/src/components/key_rotation.tsx`

- [ ] **Step 1: READ** `src/components/authorized_apps.tsx` (componente admin-ish com ação) e `src/components/user_profile.tsx` (form) — o estilo: `createElement` (sem JSX), classes BEM `authkit-*`, `useAuthkitConfig`, estados loading/error. Veja também `src/client/context.tsx` p/ `useAuthkitClient` e confirme se há um `QueryClientProvider` esperado (o admin console provê via `createAuthkitQueryClient`).

- [ ] **Step 2: Implement** `src/components/key_rotation.tsx`. O componente usa os hooks headless via `useQuery`/`useMutation` do TanStack e mostra: idade da chave, política (próxima rotação), botão "Rotacionar agora" (+ checkbox "aposentar antigas"), e um form de política (enabled/maxAgeDays/keep) salvando via `client.admin.settings`. Mantenha o estilo `createElement`+BEM.
```tsx
import { createElement, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useKeysQueryOptions, useRotateKeysMutationOptions } from '../queries/admin/index.js'
import { authkitKeys } from '../queries/keys.js'
import { useAuthkitClient } from '../client/context.js'

export interface KeyRotationProps {
  className?: string
}

/**
 * Painel admin de rotação da chave de assinatura JWKS. Mostra idade da chave +
 * política + ETA, botão "Rotacionar agora" (com opção de aposentar as antigas), e
 * o form da política (salvo via a setting `key_rotation`). Requer estar dentro de
 * um AuthkitProvider + QueryClientProvider (o admin console já provê ambos).
 */
function KeyRotationInner({ className }: KeyRotationProps) {
  const qc = useQueryClient()
  const client = useAuthkitClient()
  const status = useQuery(useKeysQueryOptions())
  const rotate = useMutation({
    ...useRotateKeysMutationOptions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() }),
  })
  const [retire, setRetire] = useState(false)

  if (status.isLoading && !status.data) {
    return createElement('div', { className: 'authkit-keys__loading' }, 'Carregando…')
  }
  if (status.error) {
    return createElement('p', { className: 'authkit-error', role: 'alert' }, (status.error as Error).message)
  }
  const data = status.data!
  const p = data.policy

  return createElement(
    'div',
    { className: ['authkit-card', 'authkit-keys', className].filter(Boolean).join(' ') },
    createElement('h3', { className: 'authkit-keys__title' }, 'Chave de assinatura'),
    createElement(
      'dl',
      { className: 'authkit-keys__stats' },
      createElement('dt', null, 'Idade'),
      createElement('dd', null, `${data.ageDays} dia(s)`),
      createElement('dt', null, 'Rotação automática'),
      createElement('dd', null, p.enabled ? `a cada ${p.maxAgeDays}d (mantém ${p.keep})` : 'desligada'),
      createElement('dt', null, 'Próxima rotação'),
      createElement('dd', null, data.nextRotationInDays === null ? '—' : `em ~${data.nextRotationInDays} dia(s)`)
    ),
    createElement(
      'label',
      { className: 'authkit-keys__retire' },
      createElement('input', {
        type: 'checkbox',
        checked: retire,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRetire(e.target.checked),
      }),
      ' Aposentar as chaves antigas de imediato'
    ),
    rotate.error
      ? createElement('p', { className: 'authkit-error', role: 'alert' }, (rotate.error as Error).message)
      : null,
    createElement(
      'button',
      {
        type: 'button',
        className: 'authkit-button authkit-button--primary',
        disabled: rotate.isPending,
        onClick: () => rotate.mutate(retire ? { retire: true } : undefined),
      },
      rotate.isPending ? 'Rotacionando…' : 'Rotacionar agora'
    )
  )
}

export function KeyRotation(props: KeyRotationProps) {
  return createElement(KeyRotationInner, props)
}
```
NOTAS:
- Confirme a API do TanStack vigente no package (v5: `isPending`/`isLoading`, `mutate`, `error`). Ajuste nomes se o package usa v4 (`isLoading` na mutation). Cheque `@tanstack/react-query` no catalog/package.json.
- Se houver um padrão de gating por `idp` (como `user_profile` faz `if (idp === 'external') return null`), aplique se fizer sentido — rotação é admin, então provavelmente sem gating de idp; mantenha simples.
- O form de política (enabled/maxAgeDays/keep salvando via `client.admin.settings.set('key_rotation', {...})`) pode ser uma 2ª iteração; se o tempo permitir, adicione um pequeno form que faz `client.admin.settings` (cheque a assinatura exata do `set`/`upsert` em `client.ts`) e invalida `authkitKeys.admin.keys()`. Se for adicionar, faça um mutation simples inline. MVP aceitável: status + rotacionar agora; o form de política pode vir logo depois.

- [ ] **Step 3:** (opcional, se houver classes) Adicione classes BEM `authkit-keys*` ao `styles.css` do package se o padrão exigir CSS bundleado (cheque se `authorized_apps` tem CSS correspondente em `styles.css`). Se as classes genéricas (`authkit-card`, `authkit-button`) bastarem, só reuse-as.

- [ ] **Step 4:** Typecheck + commit
```bash
cd packages/authkit-react && npx tsc --noEmit
git add packages/authkit-react/src/components/key_rotation.tsx packages/authkit-react/styles.css
git commit -m "feat(react): componente <KeyRotation> (status + rotacionar agora)"
```

---

## Task 6: Exports no barrel + verificação + changeset

**Files:** Modify `packages/authkit-react/index.ts`

- [ ] **Step 1: READ** `packages/authkit-react/index.ts` — como os componentes e hooks são re-exportados (ex.: `export { UserProfile } from './src/components/user_profile.js'`, `export * from './src/queries/admin/index.js'`, `export * from './src/client/types.js'`). Confirme se os hooks de `queries/admin` e os tipos de `client/types` JÁ são exportados via `export *` (provavelmente sim) — nesse caso só falta o componente.

- [ ] **Step 2:** Exporte o componente novo (e os tipos/hooks, se não forem cobertos por um `export *` existente):
```ts
export { KeyRotation, type KeyRotationProps } from './src/components/key_rotation.js'
```
Verifique que `KeysStatus`/`KeysRotateInput`/`KeysRotateResult` e os hooks `useKeys*`/`useRotateKeys*` ficam acessíveis no entrypoint (via os `export *` existentes de types/queries — confirme com um grep no `index.ts`).

- [ ] **Step 3: Verificação**
```bash
cd packages/authkit-react
npx tsc --noEmit
npm run build           # o build do package sai limpo
# se houver test runner (package.json scripts.test), rode-o
```

- [ ] **Step 4: Changeset**
```bash
cat > ../../.changeset/keystore-v2-fatia-d2.md <<'EOF'
---
'@adonis-agora/authkit-react': minor
---

feat: gestão de rotação de chave JWKS no React SDK. Novo `client.admin.keys.status()`
e `client.admin.keys.rotate()` (console API session-authed — sem API key no browser),
hooks headless TanStack `useKeysQueryOptions`/`useRotateKeysMutationOptions`, e o
componente `<KeyRotation>` (idade da chave, política, ETA e botão "Rotacionar agora").
EOF
git add ../../.changeset/keystore-v2-fatia-d2.md packages/authkit-react/index.ts
git commit -m "chore: exporta <KeyRotation> + changeset Fatia D2 (react minor)"
```

- [ ] **Step 5: Review final** (dispatch reviewer): confirmar (a) o client bate na CONSOLE API (`this.b('/keys')` → `{adminBase}/api/keys`, session-authed, NÃO Bearer); (b) os hooks seguem o padrão options-object; (c) o componente usa a API correta do TanStack vigente (isPending vs isLoading) e invalida o cache no sucesso; (d) tudo exportado no barrel; (e) `npm run build` limpo.

---

## Notas / follow-up
- **Form de política completo:** se o MVP do `<KeyRotation>` entregar só status+rotacionar, o form de `key_rotation` (enabled/maxAgeDays/keep via `client.admin.settings.set`) é um incremento pequeno logo em seguida.
- **Histórico de rotações:** o `keys.rotated` no audit já existe (D1) — um "última rotação" no painel poderia ler `client.admin.audit({ type: 'keys.rotated' })` num follow-up.
- **Fatia D completa** após D2: backend (D1) + React (D2) fecham a visão de "rotação foda + dashboard + client/react sdk".
