import type { OidcService } from '../src/provider/oidc_service.js';
import { getBootedApp } from './booted_app.js';

/**
 * Acessor singleton do {@link OidcService}, seguindo a convenção `services/main` do
 * AdonisJS (igual `@adonisjs/lucid/services/db`, `@adonisjs/drive/services/main` e
 * `@adonisjs/lock/services/main`). Permite que um app escreva
 * `import authkit from "@adonis-agora/authkit-server/services/main"` e leia
 * `authkit.config` / chame `authkit.provider` etc., em vez de resolver na mão a
 * binding string-keyed `"authkit.server"` pelo container.
 *
 * Roda `await app.booted()` no top-level, então SÓ funciona dentro de um app
 * booted — por isso `scripts/import-smoke.mjs` pula o diretório `services`.
 *
 * O `app` vem do {@link getBootedApp} (capturado pelo provider no `register()`), NÃO de
 * `import app from "@adonisjs/core/services/app"`: sob pnpm este pacote pode resolver uma cópia
 * FÍSICA de `@adonisjs/core` diferente da que o `bin/server` bootou, cujo binding de `services/app`
 * fica `undefined` — mesmo dual-package hazard do `'lucid.db'`, aqui para o singleton do core. Ver
 * {@link ./booted_app.js}. A instância que o provider recebe é sempre a bootada. Back-compat total:
 * o `default` continua sendo o {@link OidcService} resolvido.
 *
 * Dentro da própria lib continuamos resolvendo via `ctx.containerResolver.make("authkit.server")`,
 * que é o idioma das libs first-party (ver `@adonisjs/auth`, `initialize_auth_middleware`).
 */
let service: OidcService;

const app = getBootedApp();
await app.booted(async () => {
  service = await app.container.make('authkit.server');
});

export { service as default };
