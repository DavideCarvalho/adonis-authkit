# Keys Console Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma página "Signing Keys" no console admin do `adonis-authkit-server` (SPA) para: ver as chaves JWKS (kids + idade + qual é a ativa), configurar a rotação automática (enabled/maxAgeDays/keep), rotacionar agora, e "desabilitar todas + criar uma nova". Cortar release e subir no entre-textos.

**Architecture:** O backend já tem `rotateKeys(keep, retire)` (`retire:true` força keep=1 = desabilita todas + cria nova) e a setting `key_rotation`. Falta (a) o status expor a LISTA de kids, (b) a página no SPA, (c) o tipo `KeysStatus.keys` no SDK React. O SPA consome o SDK `@adonis-agora/authkit-react` (hooks `useKeysQueryOptions`/`useRotateKeysMutationOptions`/`useSetSettingMutationOptions` + `authkitKeys`), com `@tanstack/react-query`.

**Tech Stack:** AdonisJS, TypeScript, React 19, @tanstack/react-query v5, Vite (build do SPA → `build/src/host/ui-dist/`), changesets, pnpm.

**Repos:** `~/personal/adonis-authkit` (branch `feat-keys-console-page`); depois `~/personal/streaming-educacao` (bump).

---

### Task 1: Backend — expor a lista de chaves no status

Adiciona `listManagedKeys()` ao `OidcService` e inclui `keys: ManagedKeyInfo[]` no `KeysStatus`. Os dois controllers (console + REST) já retornam `buildKeysStatus(...)` → passam a incluir a lista automaticamente.

**Files:**
- Modify: `packages/authkit-server/src/keys/keystore.ts` (helper puro `listKeyInfos`)
- Modify: `packages/authkit-server/src/provider/oidc_service.ts` (método `listManagedKeys`)
- Modify: `packages/authkit-server/src/host/key_rotation_actions.ts` (`KeysStatus.keys` + `buildKeysStatus`)
- Test: `packages/authkit-server/tests/host/admin_console/console_keys.spec.ts` (estende)
- Test: `packages/authkit-server/tests/host/admin_api/api_keys.spec.ts` (estende)

- [ ] **Step 1: Helper puro em `keystore.ts`** — adicionar após `signingKeyAgeDays`:

```ts
/** Info pública de uma chave managed para o painel admin (sem material privado). */
export interface ManagedKeyInfo {
  kid: string
  alg: string
  ageDays: number
  /** true para a chave de assinatura corrente (a primeira do keystore). */
  active: boolean
}

/** Mapeia o keystore privado para infos públicas (kid/alg/idade/ativa). Vazio se null. */
export function listKeyInfos(store: PersistedKeystore | null): ManagedKeyInfo[] {
  const keys = store?.keys ?? []
  const now = Date.now() / 1000
  return keys.map((k, i) => ({
    kid: k.kid as string,
    alg: (k.alg as string) ?? 'RS256',
    ageDays: typeof k.iat === 'number' ? Math.max(0, Math.floor((now - k.iat) / 86400)) : 0,
    active: i === 0,
  }))
}
```

- [ ] **Step 2: `listManagedKeys()` no `OidcService`** — adicionar logo após `keystoreAgeDays()` (perto da linha 205). Importar `listKeyInfos`/`ManagedKeyInfo` do `../keys/keystore.js` (já importa `signingKeyAgeDays` de lá):

```ts
  /** Lista as chaves managed (kid/alg/idade/ativa), ou [] se não há keystore gerenciável. */
  async listManagedKeys(): Promise<ManagedKeyInfo[]> {
    const build = this.#deps.keystoreManager
    if (!build) return []
    const m = await build()
    return listKeyInfos(await m.read())
  }
```

Ajustar o import existente em `oidc_service.ts`:
```ts
import { signingKeyAgeDays, listKeyInfos, type ManagedKeyInfo } from '../keys/keystore.js'
```
(se o import atual for só `signingKeyAgeDays`, expandir).

- [ ] **Step 3: `KeysStatus.keys` + `buildKeysStatus` em `key_rotation_actions.ts`**:

Estender a interface e a função:
```ts
import type { ManagedKeyInfo } from '../keys/keystore.js'
// ...
export interface KeysStatus {
  ageDays: number
  policy: ResolvedKeyRotationSetting
  nextRotationInDays: number | null
  keys: ManagedKeyInfo[]
}
```
Em `buildKeysStatus`, mudar a assinatura do `svc` e incluir a lista:
```ts
export async function buildKeysStatus(
  svc: { keystoreAgeDays(): Promise<number | null>; listManagedKeys(): Promise<ManagedKeyInfo[]> },
  settings: SettingsCapability | null
): Promise<KeysStatus | null> {
  const ageDays = await svc.keystoreAgeDays()
  if (ageDays === null) return null
  const policy = settings
    ? await resolveEffectiveKeyRotation(settings)
    : { enabled: false, maxAgeDays: 90, keep: 2 }
  const nextRotationInDays = policy.enabled ? Math.max(0, policy.maxAgeDays - ageDays) : null
  const keys = await svc.listManagedKeys()
  return { ageDays, policy, nextRotationInDays, keys }
}
```

- [ ] **Step 4: Testes** — estender `console_keys.spec.ts` e `api_keys.spec.ts`: nos testes de `status` que já existem, asseverar que `body.keys` é um array com 1 entrada após `ensure()`, com `keys[0].active === true` e `keys[0].kid` igual ao kid corrente; e após uma rotação com `keep:2`, que `keys.length === 2` e só o primeiro tem `active:true`. Seguir o helper `mgr(path)` e o `fakeCtx` já existentes no arquivo.

Run: `cd ~/personal/adonis-authkit && pnpm --filter @adonis-agora/authkit-server test 2>&1 | tail -20`
Expected: suíte verde, incluindo as novas asserções.

- [ ] **Step 5: Commit**

```bash
cd ~/personal/adonis-authkit && git add packages/authkit-server/src packages/authkit-server/tests
git commit -m "feat(authkit-server): expõe lista de chaves managed no status de keys"
```

---

### Task 2: SDK React — tipo `KeysStatus.keys`

Espelha o novo campo no tipo do `@adonis-agora/authkit-react` para o console (e consumidores) terem type-safety.

**Files:**
- Modify: `packages/authkit-react/src/client/types.ts:554` (interface `KeysStatus`)

- [ ] **Step 1: Adicionar `ManagedKeyInfo` + campo `keys`** em `types.ts`, na seção "Admin — Key rotation":

```ts
/** Info pública de uma chave de assinatura managed (sem material privado). */
export interface ManagedKeyInfo {
  kid: string
  alg: string
  ageDays: number
  /** true para a chave de assinatura corrente. */
  active: boolean
}

/** Status da chave de assinatura managed (GET {base}/keys). */
export interface KeysStatus {
  ageDays: number
  policy: { enabled: boolean; maxAgeDays: number; keep: number }
  nextRotationInDays: number | null
  keys: ManagedKeyInfo[]
}
```
Garantir que `ManagedKeyInfo` seja exportado do barrel do pacote se `KeysStatus` já é (seguir o mesmo `export` do index/types).

- [ ] **Step 2: Typecheck**

Run: `cd ~/personal/adonis-authkit && pnpm --filter @adonis-agora/authkit-react typecheck 2>&1 | tail -10`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd ~/personal/adonis-authkit && git add packages/authkit-react/src
git commit -m "feat(authkit-react): KeysStatus.keys (lista de chaves managed)"
```

---

### Task 3: Console SPA — página "Signing Keys"

Nova página com: card de status (chave ativa, idade, ETA), tabela de chaves, form da política de rotação, e ações (rotacionar / desabilitar todas + criar nova). Segue o padrão de `Settings.tsx` + `settings.containers.tsx` (QueryBoundary, useToast, hooks do SDK, classes CSS existentes `panel`/`btn`/`input`/`toggle`/`settings-*`).

**Files:**
- Modify: `packages/authkit-server/ui/src/lib/router.tsx` (ROUTES)
- Modify: `packages/authkit-server/ui/src/app.tsx` (import + PAGE_TITLES + switch)
- Modify: `packages/authkit-server/ui/src/components/Sidebar.tsx` (nav item)
- Create: `packages/authkit-server/ui/src/pages/Keys.tsx`
- Create: `packages/authkit-server/ui/src/containers/keys.containers.tsx`

- [ ] **Step 1: `router.tsx`** — adicionar `'keys'` ao array `ROUTES` (entre `'clients'` e `'roles'`, ou no fim antes de `'settings'`):
```ts
export const ROUTES = [
  'overview', 'users', 'sessions', 'clients', 'roles', 'orgs', 'audit', 'keys', 'settings',
] as const
```

- [ ] **Step 2: `app.tsx`** — import + título + rota:
```ts
import { Keys } from './pages/Keys'
// PAGE_TITLES: adicionar
  keys: 'Signing Keys',
// switch: adicionar
    case 'keys': return <Keys />
```

- [ ] **Step 3: `Sidebar.tsx`** — adicionar um item na seção `Config` (antes de `settings`), com um ícone de chave:
```ts
      {
        id: 'keys',
        label: 'Signing Keys',
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="5" cy="8" r="3" />
            <path d="M8 8h6.5M12.5 8v2.5M10.5 8v2" strokeLinecap="round" />
          </svg>
        ),
      },
```

- [ ] **Step 4: `containers/keys.containers.tsx`** — lógica de dados (status + ações). Conteúdo completo:

```tsx
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useKeysQueryOptions,
  useRotateKeysMutationOptions,
  useSetSettingMutationOptions,
  authkitKeys,
} from '@adonis-agora/authkit-react'
import { QueryBoundary } from '../components/QueryBoundary'
import { Skeleton } from '../components/Skeleton'
import { useToast } from '../lib/toast'

export function KeysContainer() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    ...useKeysQueryOptions(),
    retry: (n: number, err: unknown) => {
      // 501 = jwks não é managed+store → não adianta retry
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 501) return false
      return n < 1
    },
  })

  const rotate = useMutation(useRotateKeysMutationOptions())
  const setSetting = useMutation(useSetSettingMutationOptions())

  const [maxAgeDays, setMaxAgeDays] = useState<number | null>(null)
  const [keep, setKeep] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const isNotManaged = error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 501
  if (isNotManaged) {
    return (
      <div className="error-box">
        Rotação indisponível: o <code>jwks</code> não é <code>managed</code> com um <code>store</code> persistente
        (ex.: <code>{`{ source: 'managed', store: { driver: 'lucid' } }`}</code>). Chaves inline (<code>source: 'jwks'</code>) não rotacionam.
      </div>
    )
  }

  const policy = data?.policy
  const effMaxAge = maxAgeDays ?? policy?.maxAgeDays ?? 90
  const effKeep = keep ?? policy?.keep ?? 2

  async function savePolicy(next: { enabled?: boolean; maxAgeDays?: number; keep?: number }) {
    setBusy('policy')
    try {
      const value = {
        enabled: next.enabled ?? policy?.enabled ?? false,
        maxAgeDays: next.maxAgeDays ?? effMaxAge,
        keep: next.keep ?? effKeep,
      }
      await setSetting.mutateAsync({ key: 'key_rotation', value })
      qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() })
      setMaxAgeDays(null); setKeep(null)
      toast.success('Política de rotação salva')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally { setBusy(null) }
  }

  async function doRotate(retire: boolean) {
    const msg = retire
      ? 'Isso DESABILITA todas as chaves atuais e cria uma nova. Tokens já emitidos deixam de validar imediatamente. Continuar?'
      : 'Rotacionar agora? Uma chave nova vira a ativa; as antigas continuam validando (janela de grace).'
    if (!window.confirm(msg)) return
    setBusy(retire ? 'retire' : 'rotate')
    try {
      const res = await rotate.mutateAsync(retire ? { retire: true } : { keep: effKeep })
      qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() })
      toast.success(`Rotacionado. Nova chave: ${res.newKid.slice(0, 8)}…`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally { setBusy(null) }
  }

  return (
    <QueryBoundary isLoading={isLoading} error={isNotManaged ? undefined : error} onRetry={refetch}
      skeleton={<Skeleton width="100%" height={220} />}>
      {data && (
        <>
          {/* Status */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-body">
              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-key">Chave de assinatura ativa</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {data.keys.find((k) => k.active)?.kid ?? '—'}
                  </div>
                </div>
                <div className="settings-info" style={{ textAlign: 'right' }}>
                  <div className="settings-desc">Idade: {data.ageDays} dia(s)</div>
                  <div className="settings-desc">
                    Próxima rotação: {data.nextRotationInDays === null ? '— (auto off)' : `~${data.nextRotationInDays} dia(s)`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Política de rotação */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Rotação automática</h3>
              <p style={{ marginTop: 2 }}>Gera uma chave nova quando a ativa passa da idade máxima; mantém as N mais recentes (janela de grace).</p></div></div>
            <div className="panel"><div className="panel-body" style={{ padding: 0 }}>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Habilitar rotação agendada</div>
                  <div className="settings-desc">key_rotation.enabled</div></div>
                <div className="settings-control">
                  <label className="toggle">
                    <input type="checkbox" checked={Boolean(policy?.enabled)} disabled={busy === 'policy'}
                      onChange={(e) => savePolicy({ enabled: e.target.checked })} />
                    <div className="toggle-track" /><div className="toggle-thumb" />
                  </label>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Idade máxima (dias)</div>
                  <div className="settings-desc">key_rotation.maxAgeDays</div></div>
                <div className="settings-control">
                  <input className="input input-mono" type="number" style={{ width: 90, textAlign: 'right' }}
                    value={String(effMaxAge)} onChange={(e) => setMaxAgeDays(Number(e.target.value))} />
                  {maxAgeDays !== null && <button className="btn btn-primary btn-sm" disabled={busy === 'policy'}
                    onClick={() => savePolicy({ maxAgeDays: effMaxAge })}>Save</button>}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Manter N chaves (grace)</div>
                  <div className="settings-desc">key_rotation.keep</div></div>
                <div className="settings-control">
                  <input className="input input-mono" type="number" style={{ width: 90, textAlign: 'right' }}
                    value={String(effKeep)} onChange={(e) => setKeep(Number(e.target.value))} />
                  {keep !== null && <button className="btn btn-primary btn-sm" disabled={busy === 'policy'}
                    onClick={() => savePolicy({ keep: effKeep })}>Save</button>}
                </div>
              </div>
            </div></div>
          </div>

          {/* Chaves */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Chaves no keyset</h3>
              <p style={{ marginTop: 2 }}>A primeira é a ativa (assina); as demais ainda validam tokens (grace).</p></div></div>
            <div className="panel"><div className="panel-body" style={{ padding: 0 }}>
              {data.keys.map((k) => (
                <div key={k.kid} className="settings-row">
                  <div className="settings-info">
                    <div className="settings-key" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {k.kid}
                      <span className="settings-badge" style={k.active ? { background: 'var(--accent-soft, rgba(99,102,241,0.12))', color: 'var(--accent, #6366f1)' } : undefined}>
                        {k.active ? 'ativa' : 'grace'}
                      </span>
                    </div>
                    <div className="settings-desc">{k.alg} · {k.ageDays} dia(s)</div>
                  </div>
                </div>
              ))}
            </div></div>
          </div>

          {/* Ações */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Ações</h3></div></div>
            <div className="panel"><div className="panel-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => doRotate(false)}>
                {busy === 'rotate' ? <span className="spinner sm" /> : 'Rotacionar agora'}
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => doRotate(true)}
                style={{ color: 'var(--danger, #e5484d)', borderColor: 'var(--danger, #e5484d)' }}>
                {busy === 'retire' ? <span className="spinner sm" /> : 'Desabilitar todas + criar nova'}
              </button>
            </div></div>
          </div>
        </>
      )}
    </QueryBoundary>
  )
}
```

- [ ] **Step 5: `pages/Keys.tsx`** — shell da página:

```tsx
import React from 'react'
import { KeysContainer } from '../containers/keys.containers'

export function Keys() {
  return (
    <div>
      <div className="page-header">
        <div className="page-title">Signing Keys</div>
        <div className="page-sub">Chaves JWKS de assinatura — rotação, grace e status. Mudanças aplicam ao vivo.</div>
      </div>
      <KeysContainer />
    </div>
  )
}
```

- [ ] **Step 6: Build + typecheck do SPA**

Run: `cd ~/personal/adonis-authkit && pnpm --filter @adonis-agora/authkit-server build:ui && pnpm --filter @adonis-agora/authkit-server typecheck 2>&1 | tail -15`
Expected: build do Vite OK (gera `build/src/host/ui-dist/`), typecheck sem erros. Se `useSetSettingMutationOptions`/`authkitKeys` não forem exportados do SDK, conferir o barrel `@adonis-agora/authkit-react` (já usados em `settings.containers.tsx`, então existem).

- [ ] **Step 7: Commit**

```bash
cd ~/personal/adonis-authkit && git add packages/authkit-server/ui
git commit -m "feat(authkit-server): página Signing Keys no console admin"
```

---

### Task 4: Changeset + verificação final

**Files:**
- Create: `.changeset/keys-console-page.md`

- [ ] **Step 1: Changeset** (minor nos dois pacotes):

```bash
cd ~/personal/adonis-authkit && cat > .changeset/keys-console-page.md <<'EOF'
---
"@adonis-agora/authkit-server": minor
"@adonis-agora/authkit-react": minor
---

Página "Signing Keys" no console admin: ver chaves JWKS (kids/idade/ativa), configurar rotação automática (enabled/maxAgeDays/keep), rotacionar agora e desabilitar todas + criar nova. O status de keys (`GET {base}/keys`) agora inclui a lista de chaves (`KeysStatus.keys`).
EOF
git add .changeset/keys-console-page.md && git commit -m "chore: changeset keys console page"
```

- [ ] **Step 2: Suíte completa do server + typecheck dos dois pacotes**

Run: `cd ~/personal/adonis-authkit && pnpm --filter @adonis-agora/authkit-server test 2>&1 | tail -8 && pnpm --filter @adonis-agora/authkit-react typecheck && pnpm --filter @adonis-agora/authkit-server typecheck 2>&1 | tail -5`
Expected: suíte verde, typechecks limpos.

---

## Pós-merge (ops inline, fora do subagent loop)

1. Finish branch → merge `feat-keys-console-page` em `main`.
2. `pnpm changeset version` → commit "Version Packages" → push → CI publica (authkit-server e authkit-react minor).
3. Em `streaming-educacao`: bumpar `@adonis-agora/authkit-server` e `@adonis-agora/authkit-react` pras versões novas, `pnpm install`, commit + push → deploy GuaraCloud.
4. Verificar: logar em `/auth/admin`, abrir "Signing Keys", ver o kid `3a30c90d`, política 90d/keep2, testar "Rotacionar agora".

## Critérios de sucesso

- [ ] `GET /api/authkit/v1/keys` retorna `keys: [{kid, alg, ageDays, active}]`.
- [ ] Página "Signing Keys" no nav do console; mostra chave ativa, lista, política e ações.
- [ ] "Rotacionar agora" e "Desabilitar todas + criar nova" funcionam (com confirm).
- [ ] Toggle/maxAgeDays/keep persistem em `key_rotation` e refletem no status.
- [ ] Release publicada; entre-textos consumindo; página visível em prod.
