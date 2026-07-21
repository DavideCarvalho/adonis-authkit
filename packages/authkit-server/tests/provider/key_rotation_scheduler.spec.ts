import { test } from '@japa/runner';
import { KeyRotationScheduler } from '../../src/provider/key_rotation_scheduler.js';

function sched(over: Partial<any> = {}) {
  const calls = { rotate: 0 };
  const deps = {
    policy: async () => ({ enabled: true, maxAgeDays: 90, keep: 2 }),
    ageDays: async () => 100,
    rotateKeys: async () => {
      calls.rotate++;
    },
    withLock: async (fn: () => Promise<void>) => fn(),
    intervalMs: 10,
    onError: () => {},
    ...over,
  };
  return { scheduler: new KeyRotationScheduler(deps as any), calls, deps };
}

test.group('KeyRotationScheduler', () => {
  test('rotaciona quando enabled e idade ≥ maxAgeDays', async ({ assert }) => {
    const { scheduler, calls } = sched();
    await scheduler.tick();
    assert.equal(calls.rotate, 1);
  });
  test('NÃO rotaciona quando disabled', async ({ assert }) => {
    const { scheduler, calls } = sched({
      policy: async () => ({ enabled: false, maxAgeDays: 90, keep: 2 }),
    });
    await scheduler.tick();
    assert.equal(calls.rotate, 0);
  });
  test('NÃO rotaciona quando idade < maxAgeDays', async ({ assert }) => {
    const { scheduler, calls } = sched({ ageDays: async () => 10 });
    await scheduler.tick();
    assert.equal(calls.rotate, 0);
  });
  test('NÃO rotaciona quando idade null (sem keystore)', async ({ assert }) => {
    const { scheduler, calls } = sched({ ageDays: async () => null });
    await scheduler.tick();
    assert.equal(calls.rotate, 0);
  });
  test('re-checa idade DENTRO do lock (evita dupla rotação)', async ({ assert }) => {
    let age = 100;
    const { scheduler, calls } = sched({
      ageDays: async () => age,
      withLock: async (fn: () => Promise<void>) => {
        age = 0;
        await fn();
      }, // outra instância rotacionou
    });
    await scheduler.tick();
    assert.equal(calls.rotate, 0); // re-check viu idade 0 → não rotaciona
  });
  test('passa keep da política ao rotateKeys', async ({ assert }) => {
    let keepUsed = -1;
    const { scheduler } = sched({
      policy: async () => ({ enabled: true, maxAgeDays: 90, keep: 4 }),
      rotateKeys: async (k: number) => {
        keepUsed = k;
      },
    });
    await scheduler.tick();
    assert.equal(keepUsed, 4);
  });
  test('erro vira no-op (fail-safe, onError chamado)', async ({ assert }) => {
    let errs = 0;
    const { scheduler } = sched({
      ageDays: async () => {
        throw new Error('x');
      },
      onError: () => {
        errs++;
      },
    });
    await scheduler.tick();
    assert.equal(errs, 1);
  });
});
