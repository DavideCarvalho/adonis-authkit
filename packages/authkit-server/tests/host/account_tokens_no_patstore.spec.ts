import { test } from '@japa/runner';
import AccountTokensController from '../../src/host/controllers/account_tokens_controller.js';
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js';

/**
 * Contexto HTTP mínimo para o controller de tokens. `patStore` opcional: quando
 * ausente, TODAS as actions devem devolver 404 limpo (em vez de "Cannot read
 * properties of undefined") — mesma degradação de orgs sem tabelas.
 */
function fakeCtx(cfg: Record<string, unknown> = {}) {
  const session: Record<string, unknown> = { [ACCOUNT_SESSION_KEY]: 'acc-1' };
  const notFounds: unknown[] = [];
  const redirects: string[] = [];
  const resolvedCfg = {
    render: async () => ({ _rendered: true }),
    ...cfg,
  };
  const ctx = {
    session: {
      get: (k: string) => session[k],
      flash: () => {},
      flashMessages: { get: () => undefined },
    },
    request: { csrfToken: 'csrf', only: () => ({}), param: () => 'pat-1', ip: () => '203.0.113.1' },
    response: {
      notFound: (b: unknown) => {
        notFounds.push(b ?? true);
        return { _notFound: true };
      },
      redirect: (u: string) => {
        redirects.push(u);
        return { _redirect: u };
      },
    },
    containerResolver: { make: async () => ({ config: resolvedCfg }) },
  } as any;
  return { ctx, notFounds, redirects };
}

test.group('account_tokens_controller sem patStore → 404 limpo', () => {
  test('index devolve 404 quando patStore ausente', async ({ assert }) => {
    const { ctx, notFounds } = fakeCtx({ patStore: undefined });
    await new AccountTokensController().index(ctx);
    assert.lengthOf(notFounds, 1);
  });

  test('store devolve 404 quando patStore ausente', async ({ assert }) => {
    const { ctx, notFounds } = fakeCtx({ patStore: undefined });
    await new AccountTokensController().store(ctx);
    assert.lengthOf(notFounds, 1);
  });

  test('destroy devolve 404 quando patStore ausente', async ({ assert }) => {
    const { ctx, notFounds } = fakeCtx({ patStore: undefined });
    await new AccountTokensController().destroy(ctx);
    assert.lengthOf(notFounds, 1);
  });

  test('index NÃO dá 404 quando patStore existe (renderiza)', async ({ assert }) => {
    const { ctx, notFounds } = fakeCtx({
      patStore: { listForAccount: async () => [] },
    });
    const result = (await new AccountTokensController().index(ctx)) as any;
    assert.lengthOf(notFounds, 0);
    assert.property(result, '_rendered');
  });
});
