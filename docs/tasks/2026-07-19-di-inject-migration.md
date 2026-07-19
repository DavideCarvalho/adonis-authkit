# Task: migrar `@adonis-agora/authkit-server` de service-locator → DI (`@inject`)

## Objetivo
Tirar o padrão service-locator `await ctx.containerResolver.make('authkit.server')` (e
`'authkit.client'` onde aplicável) dos controllers/host da lib `@adonis-agora/authkit-server`,
trocando por injeção de dependência idiomática do Adonis. Preservar 100% do comportamento;
suíte (1321 testes) verde.

## O problema
Todo handler dos controllers do host resolve a config/manager por **string key**:
```ts
const service = await ctx.containerResolver.make('authkit.server')
const cfg = service.config
```
Isso é service-locator. O binding `'authkit.server'` (e `'authkit.client'` no authkit-client) é
registrado por string no provider (`container.singleton('authkit.server', ...)`), então
`@inject(AuthkitServerManager)` **não resolve** direto — o container não tem o token da classe bindado.

## Abordagem recomendada (escolher 1, ver trade-off)
1. **`services/main` accessor** (igual foi feito no authkit-client 0.14.0):
   novo subpath `@adonis-agora/authkit-server/services/main` que faz
   `await app.booted(() => app.container.make('authkit.server'))` e exporta o manager tipado.
   Controllers e route-handlers inline passam a `import authkitServer from '.../services/main'`.
   - Prós: funciona em controller-classe E handler inline; menos churn; mesmo padrão do authkit-client.
   - **Pegadinha do CI**: o `scripts/import-smoke.mjs` importa a frio todo `.js` do build; `services/main`
     roda `await app.booted()` no top-level e quebra sem app booted. Adicionar `services` ao `SKIP_DIRS`
     do smoke (já foi feito pro authkit-client — replicar).
2. **Bindar o token da classe + `@inject`**: no provider, além de `container.singleton('authkit.server', ...)`,
   bindar `container.singleton(AuthkitServerManager, ...)` (mesmo factory). Controllers viram
   `@inject() constructor(private server: AuthkitServerManager) {}` e usam `this.server.config`.
   - Prós: DI "de livro" nos controllers. Contras: NÃO cobre route-handlers inline (que não aceitam @inject);
     precisa `emitDecoratorMetadata` no tsconfig do build (conferir se já tem) + `reflect-metadata` no vitest/japa.

   Recomendo a **opção 1** (services/main) por cobrir os dois casos e ser consistente com o authkit-client.

## Arquivos afetados (mapear com grep)
```
grep -rln "containerResolver.make('authkit.server')\|containerResolver.make(\"authkit.server\")" src
grep -rln "containerResolver.make('authkit.client')" src
```
Principais: `src/host/controllers/*.ts` (interaction, registration, account, etc.), rotas inline em
`src/host/register_auth_host.ts` se houver. O provider que binda `'authkit.server'`.

## Restrições / convenções do repo
- Suíte: `node --import=@poppinss/ts-exec bin/test.ts` (Japa). Manter 1321 verde.
- Typecheck: `pnpm exec tsc --noEmit` (+ `scripts/typecheck_ui.mjs` pro SPA se tocar UI).
- **Prove-by-mutation**: quebrar de propósito antes de acreditar no teste.
- Changeset (`.changeset/*.md`, bump `minor` — muda API pública com o novo subpath) + fluxo de release
  (feat PR → merge → `gh workflow run release.yml` abre "version packages" PR → merge → dispatch de novo publica).
- Se optar por services/main: replicar o fix do `import-smoke.mjs` (SKIP_DIRS inclui `services`).

## Adoção (fase 2, pós-publish)
- Não é necessária no entre-textos pro comportamento (a lib resolve interno). Mas se algum código do
  entre-textos fizer `containerResolver.make('authkit.server')`, migrar pro accessor.
- Bump da versão no `apps/entre-textos/package.json` quando publicar.

## Contexto
Padrão já aplicado no authkit-client: PR do `services/main` (0.14.0) + fix do import-smoke. Ver o commit
`feat(authkit-client): acessor services/main` como referência exata de shape (arquivo `services/main.ts`,
export no package.json, `services/**/*` no tsconfig include).
