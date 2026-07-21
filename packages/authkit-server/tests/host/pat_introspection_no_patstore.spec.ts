import { test } from '@japa/runner';
import PatIntrospectionController from '../../src/host/controllers/pat_introspection_controller.js';

/**
 * Contexto HTTP mínimo para o controller de introspecção de PAT. A rota
 * `/authkit/pat/introspect` é sempre montada, mesmo em hosts que configuram
 * `patIntrospectionSecret` sem cabear `patStore` — antes disso caía num
 * `cfg.patStore!.findActiveByToken(...)` (500 por non-null assertion sobre
 * config opcional). O contrato correto (RFC 7662) é responder `{ active: false }`.
 */
function fakeCtx(
  cfg: Record<string, unknown> = {},
  opts: { authHeader?: string; token?: string } = {},
) {
  const resolvedCfg = {
    patIntrospectionSecret: 'segredo-correto',
    accountStore: { findById: async () => null },
    ...cfg,
  };
  const ctx = {
    request: {
      header: (name: string) => (name === 'authorization' ? opts.authHeader : undefined),
      input: (key: string) => (key === 'token' ? (opts.token ?? 'algum-token') : undefined),
      ip: () => '203.0.113.1',
    },
    response: {
      unauthorized: (b: unknown) => ({ _unauthorized: true, body: b }),
      notFound: () => ({ _notFound: true }),
    },
    containerResolver: { make: async () => ({ config: resolvedCfg }) },
  } as any;
  return { ctx };
}

test.group('pat_introspection_controller sem patStore → { active: false }', () => {
  test('devolve { active: false } quando patStore ausente (não 500)', async ({ assert }) => {
    const { ctx } = fakeCtx(
      { patStore: undefined },
      { authHeader: 'Bearer segredo-correto', token: 'tok-1' },
    );
    const result = await new PatIntrospectionController().handle(ctx);
    assert.deepEqual(result, { active: false });
  });

  test('continua exigindo o segredo mesmo sem patStore', async ({ assert }) => {
    const { ctx } = fakeCtx(
      { patStore: undefined },
      { authHeader: 'Bearer segredo-errado', token: 'tok-1' },
    );
    const result = (await new PatIntrospectionController().handle(ctx)) as any;
    assert.isTrue(result._unauthorized);
  });

  test('com patStore existente, segue resolvendo o token normalmente', async ({ assert }) => {
    const { ctx } = fakeCtx(
      {
        patStore: {
          findActiveByToken: async () => ({
            accountId: 'acc-1',
            scopes: ['read'],
            audience: 'api',
            exp: 123,
          }),
        },
        accountStore: {
          findById: async () => ({ id: 'acc-1', email: 'a@b.com', globalRoles: [] }),
        },
      },
      { authHeader: 'Bearer segredo-correto', token: 'tok-1' },
    );
    const result = (await new PatIntrospectionController().handle(ctx)) as any;
    assert.isTrue(result.active);
    assert.equal(result.sub, 'acc-1');
  });
});
