import type { Identity } from '@adonis-agora/authkit-core';
import { test } from '@japa/runner';
import { Authenticator } from '../src/authenticator.js';

const identity: Identity = {
  userId: 'u1',
  email: 'a@b.com',
  globalRoles: ['ADMIN'],
  profile: { name: 'Ana' },
  issuedAt: 0,
  expiresAt: 0,
  raw: {},
};

test.group('Authenticator', () => {
  test('identity é memoizada (resolve uma vez)', async ({ assert }) => {
    let calls = 0;
    const auth = new Authenticator({} as any, {
      resolver: {
        resolve: async () => {
          calls++;
          return identity;
        },
      } as any,
      resolveUser: async () => ({ id: 'u1', name: 'app user' }),
    });
    assert.equal((await auth.getIdentity())!.userId, 'u1');
    await auth.getIdentity();
    assert.equal(calls, 1);
  });

  test('hasGlobalRole lê das claims (sync após resolver)', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
    });
    await auth.authenticate();
    assert.isTrue(auth.hasGlobalRole('ADMIN'));
    assert.isFalse(auth.hasGlobalRole('STAFF'));
  });

  test('toSharedProps devolve só user + globalRoles (sem appRoles/abilities)', async ({
    assert,
  }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
      resolveUser: async () => ({ id: 'u1', name: 'app user' }),
    });
    const shared = await auth.toSharedProps();
    assert.deepEqual(shared, {
      user: { id: 'u1', name: 'app user' },
      globalRoles: ['ADMIN'],
    });
    assert.notProperty(shared, 'appRoles');
    assert.notProperty(shared, 'abilities');
  });

  test('getUser usa resolveUser e memoiza', async ({ assert }) => {
    let calls = 0;
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
      resolveUser: async () => {
        calls++;
        return { id: 'u1' };
      },
    });
    await auth.getUser();
    await auth.getUser();
    assert.equal(calls, 1);
  });

  test('authenticate lança quando não autenticado', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => null } as any,
    });
    await assert.rejects(() => auth.authenticate());
    assert.isFalse(await auth.check());
  });

  test('getUserOrFail devolve o usuário não-nulo quando há sessão', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
      resolveUser: async () => ({ id: 'u1', name: 'app user' }),
    });
    const user = await auth.getUserOrFail();
    assert.deepEqual(user, { id: 'u1', name: 'app user' });
  });

  test('getUserOrFail lança quando não há sessão (fail-closed)', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => null } as any,
      resolveUser: async () => ({ id: 'u1' }),
    });
    await assert.rejects(() => auth.getUserOrFail());
  });

  test('getUserOrFail lança quando há sessão mas nenhum resolveUser', async ({ assert }) => {
    const auth = new Authenticator({} as any, {
      resolver: { resolve: async () => identity } as any,
    });
    await assert.rejects(() => auth.getUserOrFail());
  });
});
