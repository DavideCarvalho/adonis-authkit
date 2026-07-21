import { test } from '@japa/runner';
import { KEY_ROTATION_DEFAULTS, resolveEffectiveKeyRotation } from '../../src/host/key_rotation.js';

function settingsWith(value: unknown) {
  return { getSetting: async () => value } as any;
}

test.group('resolveEffectiveKeyRotation', () => {
  test('ausente → defaults (enabled:false)', async ({ assert }) => {
    assert.deepEqual(await resolveEffectiveKeyRotation(settingsWith(null)), KEY_ROTATION_DEFAULTS);
    assert.isFalse(KEY_ROTATION_DEFAULTS.enabled);
    assert.equal(KEY_ROTATION_DEFAULTS.maxAgeDays, 90);
    assert.equal(KEY_ROTATION_DEFAULTS.keep, 2);
  });
  test('valores válidos são aplicados', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation(
      settingsWith({ enabled: true, maxAgeDays: 30, keep: 3 }),
    );
    assert.deepEqual(r, { enabled: true, maxAgeDays: 30, keep: 3 });
  });
  test('valores inválidos caem no default por-campo', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation(
      settingsWith({ enabled: 'x', maxAgeDays: 0, keep: -1 }),
    );
    assert.deepEqual(r, { enabled: false, maxAgeDays: 90, keep: 2 });
  });
  test('erro de leitura → defaults (fail-safe)', async ({ assert }) => {
    const r = await resolveEffectiveKeyRotation({
      getSetting: async () => {
        throw new Error('db');
      },
    } as any);
    assert.deepEqual(r, KEY_ROTATION_DEFAULTS);
  });
});
