/**
 * Fix: `passkeyRegisterVerify` respondia sempre `{ ok: true }` JSON no sucesso —
 * um `<form>` HTML clássico ficava encarando JSON cru. Agora o endpoint é DUAL:
 * navegação (aceita text/html, não pede JSON) → redirect para a tela de MFA;
 * XHR/fetch → JSON de sempre.
 */

import { test } from '@japa/runner';
import AccountMfaController from '../../src/host/controllers/account_mfa_controller.js';
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js';
import { ACCOUNT_SESSION_KEY } from '../../src/host/middleware/account_auth.js';
import { SUDO_ACCOUNT_SESSION_KEY, SUDO_SESSION_KEY } from '../../src/host/sudo_mode.js';

const USER = 'acc-1';
const CHALLENGE_KEY = 'authkit_passkey_reg_challenge';

/**
 * `ctx` mínimo para chamar `passkeyRegisterVerify` no caminho de sucesso.
 * A sessão já vem com sudo ativo (vinculado à conta) para passar o gate; o
 * challenge de registro está guardado; o store aceita a verificação.
 */
function fakeCtx(accept: string) {
  const session: Record<string, unknown> = {
    [ACCOUNT_SESSION_KEY]: USER,
    [SUDO_SESSION_KEY]: Date.now(),
    [SUDO_ACCOUNT_SESSION_KEY]: USER,
    [CHALLENGE_KEY]: 'chal-1',
  };
  const cfg = {
    messages: { ...DEFAULT_MESSAGES },
    accountStore: {
      async verifyPasskeyRegistration() {
        return true;
      },
      async findById(id: string) {
        return id === USER ? { id: USER, email: 'u@e.com' } : null;
      },
    },
    audit: { async record() {} },
    mail: {},
  } as any;

  const redirects: string[] = [];
  let jsonBody: unknown;
  const ctx = {
    session: {
      get: (k: string) => session[k],
      put: (k: string, v: unknown) => {
        session[k] = v;
      },
      forget: (k: string) => {
        delete session[k];
      },
      flash: () => {},
      flashMessages: { get: () => null },
    },
    request: {
      header: (name: string) => (name.toLowerCase() === 'accept' ? accept : undefined),
      input: (_k: string, fallback?: unknown) => fallback ?? { id: 'cred' },
      body: () => ({ id: 'cred' }),
      ip: () => '203.0.113.1',
    },
    response: {
      redirect: (url: string) => {
        redirects.push(url);
        return { _redirect: url };
      },
      badRequest: (b: unknown) => ({ _badRequest: b }),
      notFound: (b: unknown) => ({ _notFound: b }),
    },
    containerResolver: { make: async () => ({ config: cfg }) },
  } as any;

  return { ctx, redirects, getJson: () => jsonBody, setJson: (v: unknown) => (jsonBody = v) };
}

test.group('passkeyRegisterVerify — resposta dual', () => {
  test('navegação (Accept: text/html) → redirect para a tela de MFA', async ({ assert }) => {
    const h = fakeCtx('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
    const controller = new AccountMfaController();
    const result = await controller.passkeyRegisterVerify(h.ctx);
    assert.deepEqual(h.redirects, ['/account/mfa']);
    // Redirect, não JSON.
    assert.notProperty(result ?? {}, 'ok');
  });

  test('XHR (Accept: application/json) → JSON { ok: true }, sem redirect', async ({ assert }) => {
    const h = fakeCtx('application/json');
    const controller = new AccountMfaController();
    const result = await controller.passkeyRegisterVerify(h.ctx);
    assert.deepEqual(result, { ok: true });
    assert.lengthOf(h.redirects, 0);
  });

  test('fetch coringa (Accept: */*) cai no ramo JSON (mantém a mfa.edge)', async ({ assert }) => {
    const h = fakeCtx('*/*');
    const controller = new AccountMfaController();
    const result = await controller.passkeyRegisterVerify(h.ctx);
    assert.deepEqual(result, { ok: true });
    assert.lengthOf(h.redirects, 0);
  });
});
