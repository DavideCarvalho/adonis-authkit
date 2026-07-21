import { IgnitorFactory } from '@adonisjs/core/factories';
import { test } from '@japa/runner';
import RedisMock from 'ioredis-mock';
import { adapters, defineConfig } from '../src/define_config.js';
import { fakeAccountStore } from './bootstrap.js';

const APP_ROOT = new URL('./fixtures/boot_app/', import.meta.url);

/**
 * Regression (ITEM 2 — appKey ausente): antes desta mudança, um host sem
 * `app.appKey` configurado subia normalmente — o RuntimeException só existia
 * dentro do factory LAZY de `authkit.server`, e nada no boot resolvia esse
 * binding de forma não-blindada (o poller/scheduler engolem erros do
 * `container.make` via `.catch(() => null)`). O erro real só apareceria na
 * 1ª request que tocasse uma rota do authkit — um 500 sem contexto fora do
 * modo dev.
 *
 * Este teste sobe uma `Application` REAL via `IgnitorFactory` (não um mock de
 * `{ config: { get } }`) e prova que `AuthkitServerProvider#boot()` agora
 * rejeita IMEDIATAMENTE, com uma mensagem que nomeia `config/app.ts`/`appKey`,
 * antes de qualquer request acontecer.
 */
function buildApp(appConfig: Record<string, any>) {
  const authkitConfig = defineConfig({
    issuer: 'https://auth.test',
    adapter: adapters.redis({ connection: 'main' }),
    jwks: { source: 'managed', algorithm: 'RS256' },
    accountStore: fakeAccountStore(),
  });

  const ignitor = new IgnitorFactory()
    .withCoreProviders()
    .withCoreConfig()
    .merge({
      config: {
        app: appConfig,
        authkit: authkitConfig,
        redis: {
          connection: 'main',
          connections: { main: { host: '127.0.0.1', port: 6379 } },
        },
      },
    })
    .create(APP_ROOT);

  return ignitor.createApp('web');
}

test.group('provider boot — appKey validation (ITEM 2)', () => {
  test('app real: AuthkitServerProvider#boot() rejeita alto e cedo quando app.appKey está ausente', async ({
    assert,
  }) => {
    const app = buildApp({});
    const { default: AuthkitServerProvider } = await import(
      '../providers/authkit_server_provider.js'
    );

    // Boot da app REAL (core providers) — popula `app.config` de verdade.
    await app.init();
    app.container.singleton('redis' as any, async () => ({ connection: () => new RedisMock() }));
    await app.boot();

    // O provider do authkit não está no `.adonisrc` deste app de teste — instanciamos
    // e chamamos seu ciclo de vida diretamente, exatamente como o AdonisJS faria.
    const provider = new AuthkitServerProvider(app);
    provider.register();

    await assert.rejects(() => provider.boot(), /APP_KEY ausente.*config\/app\.ts/s);
  });

  test('app real: AuthkitServerProvider#boot() sobe normalmente quando app.appKey está presente', async ({
    assert,
  }) => {
    const app = buildApp({ appKey: 'a'.repeat(32) });
    const { default: AuthkitServerProvider } = await import(
      '../providers/authkit_server_provider.js'
    );

    await app.init();
    app.container.singleton('redis' as any, async () => ({ connection: () => new RedisMock() }));
    await app.boot();

    const provider = new AuthkitServerProvider(app);
    provider.register();

    await assert.doesNotReject(() => provider.boot());
  });
});
