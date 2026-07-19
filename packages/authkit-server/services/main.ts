import app from "@adonisjs/core/services/app";
import type { OidcService } from "../src/provider/oidc_service.js";

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
 * Dentro da própria lib continuamos resolvendo via `ctx.containerResolver.make("authkit.server")`,
 * que é o idioma das libs first-party (ver `@adonisjs/auth`, `initialize_auth_middleware`).
 */
let service: OidcService;

await app.booted(async () => {
  service = await app.container.make("authkit.server");
});

export { service as default };
