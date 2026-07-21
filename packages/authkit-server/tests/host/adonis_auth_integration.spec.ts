import { AuthManager, defineConfig as defineAuthConfig, symbols } from '@adonisjs/auth';
import { sessionGuard } from '@adonisjs/auth/session';
import { configProvider } from '@adonisjs/core';
import { AppFactory } from '@adonisjs/core/factories/app';
import { EmitterFactory } from '@adonisjs/core/factories/events';
import { test } from '@japa/runner';
import RedisMock from 'ioredis-mock';
import { adapters, defineConfig } from '../../src/define_config.js';
import { authkitUserProvider } from '../../src/host/adonis_auth_user_provider.js';
import AccountSessionController from '../../src/host/controllers/account_session_controller.js';
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js';
import { fakeAccountStore } from '../bootstrap.js';

/**
 * Regression (ITEM 1 — zero integração com @adonisjs/auth):
 *
 * Antes desta mudança, NENHUM controller do authkit-server chamava
 * `auth.use(guard).login(user)`. O login do console de conta autenticava
 * SÓ via cookie bespoke (`ACCOUNT_SESSION_KEY`, `@adonisjs/session` puro) —
 * um app que instala @adonisjs/auth normalmente (`middleware.auth()`,
 * `ctx.auth.user`, Bouncer's `() => ctx.auth.user`) via um sessionGuard
 * qualquer nunca teria `ctx.auth.user` populado, silenciosamente.
 *
 * Este teste sobe uma `Authenticator` REAL de `@adonisjs/auth` (não um mock),
 * usando `authkitUserProvider()` como user provider do sessionGuard, exatamente
 * como um host configuraria em `config/auth.ts`. Depois chama o
 * `AccountSessionController#login`/`#logout` REAL (não uma reimplementação) e
 * prova que `ctx.auth.use('web').user`/`.check()` refletem a MESMA conta que o
 * cookie bespoke do authkit autentica — a integração fim-a-fim que faltava.
 */

const EMAIL = 'a@b.com';
const ACCOUNT_ID = 'u1';

/** Monta um app real (AppFactory) com `authkit.accountStore` e `emitter` ligados. */
async function buildApp(store: ReturnType<typeof fakeAccountStore>) {
  const app = new AppFactory().create(new URL('../', import.meta.url), () => {});
  await app.init();
  app.container.singleton('authkit.accountStore', async () => store);
  app.container.singleton('emitter', async () => new EmitterFactory().create(app));
  // adapters.redis({ connection: 'main' }) só usa .connection() — RedisMock cobre isso.
  app.container.singleton('redis' as any, async () => ({ connection: () => new RedisMock() }));
  return app;
}

/** Resolve um Authenticator real de @adonisjs/auth, com o sessionGuard 'web' plugado no authkitUserProvider(). */
async function buildAuthenticator(app: Awaited<ReturnType<typeof buildApp>>, ctx: any) {
  const authConfigProvider = defineAuthConfig({
    default: 'web',
    guards: {
      web: sessionGuard({ useRememberMeTokens: false, provider: authkitUserProvider() }),
    },
  });
  const resolved = await configProvider.resolve<any>(app, authConfigProvider);
  const manager = new AuthManager(resolved!);
  return manager.createAuthenticator(ctx);
}

/** ctx mínimo que dá conta do fluxo REAL de AccountSessionController#login/logout. */
function buildCtx() {
  const sessionData = new Map<string, unknown>();
  const redirects: string[] = [];
  const ctx: any = {
    session: {
      put: (k: string, v: unknown) => sessionData.set(k, v),
      get: (k: string) => sessionData.get(k),
      forget: (k: string) => sessionData.delete(k),
      regenerate: async () => {},
      sessionId: 'sess-1',
    },
    request: {
      only: () => ({ email: EMAIL, password: 'whatever' }),
      input: () => undefined,
      ip: () => '127.0.0.1',
      header: () => undefined,
      encryptedCookie: () => undefined,
      csrfToken: 'csrf-tok',
    },
    response: {
      redirect: (to: string) => redirects.push(to),
      clearCookie: () => {},
      encryptedCookie: () => {},
    },
    logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') throw new Error('set by test');
        throw new Error(`unexpected container key in test: ${key}`);
      },
    },
  };
  return { ctx, sessionData, redirects };
}

test.group('@adonisjs/auth integration (ITEM 1)', () => {
  test('login com adonisAuth.guard configurado popula ctx.auth.user com a MESMA conta', async ({
    assert,
  }) => {
    const store = fakeAccountStore({
      verifyCredentials: async (email) =>
        email === EMAIL ? { id: ACCOUNT_ID, email: EMAIL, globalRoles: ['ADMIN'] } : null,
    });
    const app = await buildApp(store);
    const { ctx, sessionData, redirects } = buildCtx();

    const authenticator = await buildAuthenticator(app, ctx);
    ctx.auth = authenticator;

    const cfg = await configProvider.resolve<any>(
      app,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256' },
        accountStore: store,
        lockout: { enabled: false },
        adonisAuth: { guard: 'web' },
      }),
    );
    ctx.containerResolver.make = async (key: string) => {
      if (key === 'authkit.server') return { config: cfg };
      throw new Error(`unexpected container key in test: ${key}`);
    };

    const controller = new AccountSessionController();
    await controller.login(ctx);

    // Comportamento de sempre (cookie bespoke) continua intacto.
    assert.equal(sessionData.get(ACCOUNT_SESSION_KEY), ACCOUNT_ID);
    assert.lengthOf(redirects, 1);

    // O QUE FALTAVA: ctx.auth (a REAL @adonisjs/auth) agora reflete a mesma conta.
    assert.isTrue(await ctx.auth.use('web').check());
    assert.deepEqual(ctx.auth.use('web').user, {
      id: ACCOUNT_ID,
      email: EMAIL,
      globalRoles: ['ADMIN'],
    });

    // logout() também desloga o guard de @adonisjs/auth (ctx.containerResolver.make
    // já está setado pro authkit.server desde o login acima).
    await controller.logout(ctx);
    assert.isUndefined(sessionData.get(ACCOUNT_SESSION_KEY));
    assert.isFalse(await ctx.auth.use('web').check());
  });

  test('sem adonisAuth.guard configurado: ctx.auth nunca é tocado (opt-in, comportamento de sempre)', async ({
    assert,
  }) => {
    const store = fakeAccountStore({
      verifyCredentials: async (email) =>
        email === EMAIL ? { id: ACCOUNT_ID, email: EMAIL, globalRoles: [] } : null,
    });
    const app = await buildApp(store);
    const { ctx, sessionData } = buildCtx();

    const authenticator = await buildAuthenticator(app, ctx);
    ctx.auth = authenticator;

    const cfg = await configProvider.resolve<any>(
      app,
      defineConfig({
        issuer: 'https://auth.test',
        adapter: adapters.redis({ connection: 'main' }),
        jwks: { source: 'managed', algorithm: 'RS256' },
        accountStore: store,
        lockout: { enabled: false },
        // adonisAuth OMITIDO DE PROPÓSITO — opt-in.
      }),
    );
    ctx.containerResolver.make = async (key: string) => {
      if (key === 'authkit.server') return { config: cfg };
      throw new Error(`unexpected: ${key}`);
    };

    const controller = new AccountSessionController();
    await controller.login(ctx);

    // Cookie bespoke autentica normalmente...
    assert.equal(sessionData.get(ACCOUNT_SESSION_KEY), ACCOUNT_ID);
    // ...mas @adonisjs/auth nunca foi chamado — comportamento pré-existente preservado.
    assert.isFalse(await ctx.auth.use('web').check());
  });

  test('authkitUserProvider().findById resolve via authkit.accountStore e usa o símbolo real de @adonisjs/auth', async ({
    assert,
  }) => {
    const store = fakeAccountStore({
      findById: async (id) =>
        id === ACCOUNT_ID ? { id: ACCOUNT_ID, email: EMAIL, globalRoles: [] } : null,
    });
    const app = await buildApp(store);
    const resolved = await configProvider.resolve<any>(app, authkitUserProvider());
    assert.isTrue(symbols.PROVIDER_REAL_USER in resolved);

    const guardUser = await resolved.findById(ACCOUNT_ID);
    assert.isNotNull(guardUser);
    assert.equal(guardUser!.getId(), ACCOUNT_ID);
    assert.equal(guardUser!.getOriginal().id, ACCOUNT_ID);

    const missing = await resolved.findById('ghost');
    assert.isNull(missing);
  });
});
