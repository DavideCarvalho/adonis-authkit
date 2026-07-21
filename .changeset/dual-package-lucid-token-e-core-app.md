---
'@adonis-agora/authkit-server': patch
---

Corrige dois resíduos do dual-package hazard e endurece a visibilidade de falha.

**1 — `recordSubRevocation` resolvia o Lucid pela classe `Database`.**
`AdminSessionsService.recordSubRevocation` ainda fazia `import('@adonisjs/lucid/services/db')`,
que resolve a CLASSE `Database` e a usa como TOKEN do container. Com duas cópias físicas do
lucid na árvore do host (pins distintos, ou o mesmo pin sob peer sets distintos que o pnpm
materializa em diretórios separados), os tokens-classe diferem, o `make()` falha e — pior — a
gravação da revogação por `sub` (`auth_session_revocations`) era engolida EM SILÊNCIO pelo catch
best-effort: nem crash, nem log. Agora resolve pelo alias string `'lucid.db'` (o mesmo idioma de
`runtime_settings.ts` e do provider), imune à deduplicação do host. A falha continua sem
propagar (a invalidação server-side já é a fonte da verdade), mas nunca mais é silenciosa: é
logada em `error`.

**2 — `services/main` capturava o `app` do core por import eager.**
`services/main.ts` importava `app` de `@adonisjs/core/services/app` (eager) + `await app.booted()`
no top-level — o mesmo hazard, agora para o singleton do core: sob pnpm este pacote pode resolver
uma cópia física de `@adonisjs/core` diferente da que o `bin/server` bootou, cujo binding de
`services/app` fica `undefined`. O `app` passa a vir de `services/booted_app.ts`, capturado pelo
provider no `register()` via `setBootedApp(this.app)`. Back-compat total: o `default` continua
sendo o `OidcService` resolvido.

Também: adicionado `prepack` (espelha o `build` composto — css + webauthn + ui + tsc + cópias)
para que o pacote seja sempre construído antes de publicar.

**Nota de transparência:** a escrita best-effort da revogação de sessão e o
`services/main` agora exigem o `AuthkitServerProvider` registrado; sem ele,
lançam/logam erro explícito em vez de silenciar ou pendurar. Nenhum host real
perde comportamento (o provider é sempre registrado), mas suítes downstream que
exercitem deleção/revogação sem o provider verão o erro no stderr.
