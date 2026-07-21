import app from '@adonisjs/core/services/app';
import type { AuthkitClientManager } from '../providers/authkit_client_provider.js';

/**
 * Singleton accessor for the {@link AuthkitClientManager}, following the Adonis `services/main`
 * convention (like `db`, `mail`, `drive`). Lets an app write
 * `import authkit from "@adonis-agora/authkit-client/services/main"` and read `authkit.clientConfig`
 * / call `authkit.getIdToken(ctx)` etc., instead of resolving the string-keyed `"authkit.client"`
 * binding through the container by hand.
 */
let manager: AuthkitClientManager;

await app.booted(async () => {
  manager = await app.container.make('authkit.client');
});

export { manager as default };
