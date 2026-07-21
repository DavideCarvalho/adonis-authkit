import { test } from '@japa/runner';
import { oidcStepUp } from '../../src/host/sudo/methods/oidc_step_up.js';

function ctxWith(returnTo: string | null = null) {
  return {
    accountId: 'acc-1',
    account: { id: 'acc-1', email: 'u@e.com' },
    returnTo,
    cfg: {},
    ctx: {},
  } as any;
}

test.group('sudoMethods.oidcStepUp', () => {
  test('está SEMPRE disponível — é o método que quebra o deadlock', async ({ assert }) => {
    assert.isTrue(await oidcStepUp({ url: '/auth/step-up' }).isAvailable(ctxWith()));
  });

  test('descreve um redirect para a URL do host', async ({ assert }) => {
    const d = await oidcStepUp({ url: '/auth/step-up' }).describe(ctxWith());
    assert.equal(d.kind, 'redirect');
    assert.equal(d.endpoint, '/auth/step-up');
  });

  test('propaga o returnTo na querystring, encodado', async ({ assert }) => {
    const d = await oidcStepUp({ url: '/auth/step-up' }).describe(ctxWith('/account/security'));
    assert.equal(d.endpoint, '/auth/step-up?return_to=%2Faccount%2Fsecurity');
  });

  test('não registra rotas — o fluxo sai do pacote', ({ assert }) => {
    assert.isUndefined(oidcStepUp({ url: '/auth/step-up' }).register);
  });
});
