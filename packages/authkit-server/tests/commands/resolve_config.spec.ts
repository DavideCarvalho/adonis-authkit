import { configProvider } from '@adonisjs/core';
import { test } from '@japa/runner';
import { resolveAuthkitConfig } from '../../src/commands/resolve_config.js';

/**
 * Regressão: `config.get('authkit')` devolve o config PROVIDER cru (defineConfig
 * retorna configProvider.create). Comandos ace (doctor, users:import, keys:rotate)
 * precisam resolvê-lo — sem isso, todo campo aparece como ausente num config válido.
 */
test.group('commands | resolveAuthkitConfig', () => {
  const fakeApp = {} as any;

  test('resolve um config provider para o valor final', async ({ assert }) => {
    const provider = configProvider.create(async () => ({
      issuer: 'https://acme.test',
      jwksConfig: { source: 'managed' },
    }));
    const resolved = await resolveAuthkitConfig<Record<string, any>>(fakeApp, provider);
    assert.equal(resolved?.issuer, 'https://acme.test');
    assert.deepEqual(resolved?.jwksConfig, { source: 'managed' });
  });

  test('objeto plano passa direto (fixtures/configs antigos)', async ({ assert }) => {
    const plain = { issuer: 'https://plain.test', accountStore: { findById: () => null } };
    const resolved = await resolveAuthkitConfig<Record<string, any>>(fakeApp, plain);
    assert.strictEqual(resolved, plain);
  });

  test('null/undefined viram null', async ({ assert }) => {
    assert.isNull(await resolveAuthkitConfig(fakeApp, null));
    assert.isNull(await resolveAuthkitConfig(fakeApp, undefined));
  });
});
