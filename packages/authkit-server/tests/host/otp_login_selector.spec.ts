/**
 * O seletor "choose-first" do login (a tela de senha renderizada por `show()`
 * DEPOIS que o e-mail já entrou na sessão, com `magicLinkSent` ainda falso)
 * precisa saber se o login por OTP está disponível para oferecer a opção
 * "código" ANTES de qualquer envio de magic link.
 *
 * `otpEnabled` é um fato de disponibilidade de método de login e vem do helper
 * `#loginMethods` — espalhado em TODOS os renders do passo login. Estes testes
 * exercitam o controller com o padrão fake-ctx + render capturado (igual ao de
 * `registration_toggles.spec.ts`) e afirmam que o render do identifier/seletor
 * carrega `otpEnabled`.
 *
 * PROVA DE MUTAÇÃO: se `#loginMethods` deixar de incluir `otpEnabled`, o render
 * do seletor perde a flag e o primeiro teste vira VERMELHO — o seletor não
 * conseguiria mais oferecer "código" antes do envio.
 */

import { test } from '@japa/runner';
import type { AccountStore } from '../../src/accounts/account_store.js';
import { resolveLogin, resolvePasswordless } from '../../src/define_config.js';
import InteractionController from '../../src/host/controllers/interaction_controller.js';

const EMAIL = 'user@example.com';

/** DB sem tabela `auth_settings` → RuntimeSettings degrada para os defaults do config. */
function noTableDb() {
  return {
    from() {
      return (this as any).table();
    },
    table() {
      throw new Error('no table');
    },
  };
}

/** Store base (magic link) + OTP opcional (issueMagicLinkWithCode + verifyLoginCode). */
function makeStore(opts: { otp: boolean }): AccountStore {
  const account = {
    id: 'acc-1',
    email: EMAIL,
    name: 'Test User',
    avatarUrl: null,
    globalRoles: ['USER'],
  };
  const store: any = {
    findByEmail: async (email: string) => (email === EMAIL ? account : null),
    findById: async (id: string) => (id === account.id ? account : null),
    verifyCredentials: async () => null,
    create: async () => {
      throw new Error('not used');
    },
    // MagicLinkCapability (habilita o passo de senha com magic link)
    issueMagicLinkToken: async () => null,
  };
  if (opts.otp) {
    // OtpLoginCapability — o par que `supportsOtpLogin` exige.
    store.issueMagicLinkWithCode = async () => null;
    store.verifyLoginCode = async () => ({ status: 'invalid' as const });
  }
  return store as AccountStore;
}

function buildService(opts: { otpEnabled: boolean; store: AccountStore }) {
  const rendered: Array<{ view: string; props: Record<string, any> }> = [];
  const config = {
    render: async (_ctx: any, view: string, props: Record<string, any>) => {
      rendered.push({ view, props });
      return { view, props };
    },
    messages: {},
    branding: {
      default: { appName: 'Acme', logoUrl: null },
      clients: {},
      firstParty: [],
      company: undefined,
    },
    botProtection: undefined,
    passwordless: resolvePasswordless({ magicLink: true, passkeyFirst: false }),
    login: resolveLogin({ otp: { enabled: opts.otpEnabled } }),
    registration: { enabled: true },
    social: undefined,
    authMethods: undefined,
    accountStore: opts.store,
  };
  const interactions = {
    details: async () => ({
      uid: 'test-uid',
      params: { client_id: 'web' },
      prompt: { name: 'login' },
    }),
  };
  return { service: { config, interactions }, rendered };
}

function fakeCtx(service: any, db: any, opts: { email?: string } = {}) {
  const session: Record<string, unknown> = {};
  if (opts.email) session.authkit_login_email = opts.email;
  return {
    containerResolver: {
      make: async (key: string) => {
        if (key === 'authkit.server') return service;
        if (key === 'lucid.db') return db;
        throw new Error(`unknown: ${key}`);
      },
    },
    request: {
      csrfToken: 'csrf',
      param: (_k: string) => 'test-uid',
      only: () => ({}),
      input: (_k: string, def?: any) => def,
      qs: () => ({}),
      ip: () => '1.2.3.4',
    },
    session: { get: (k: string) => session[k], put: () => {} },
    response: { redirect: (_url: string) => undefined },
  } as any;
}

test.group('login OTP selector — otpEnabled em todos os renders do passo login', () => {
  test('seletor (e-mail na sessão, sem magic ainda) carrega otpEnabled=true quando ligado + store suporta', async ({
    assert,
  }) => {
    const { service, rendered } = buildService({
      otpEnabled: true,
      store: makeStore({ otp: true }),
    });
    const ctx = fakeCtx(service, noTableDb(), { email: EMAIL });

    await new InteractionController().show(ctx);

    const [r] = rendered;
    assert.equal(r.view, 'login');
    assert.equal(r.props.step, 'password');
    // "sem magic ainda": o seletor NÃO está no estado magicLinkSent.
    assert.notEqual(r.props.magicLinkSent, true);
    // A flag que o seletor choose-first precisa para oferecer a opção "código".
    assert.isTrue(r.props.otpEnabled);
  });

  test('otpEnabled=false quando login.otp.enabled está desligado', async ({ assert }) => {
    const { service, rendered } = buildService({
      otpEnabled: false,
      store: makeStore({ otp: true }),
    });
    const ctx = fakeCtx(service, noTableDb(), { email: EMAIL });

    await new InteractionController().show(ctx);

    assert.equal(rendered[0].props.step, 'password');
    assert.isFalse(rendered[0].props.otpEnabled);
  });

  test('otpEnabled=false quando o store NÃO suporta OTP (mesmo com a config ligada)', async ({
    assert,
  }) => {
    const { service, rendered } = buildService({
      otpEnabled: true,
      store: makeStore({ otp: false }),
    });
    const ctx = fakeCtx(service, noTableDb(), { email: EMAIL });

    await new InteractionController().show(ctx);

    assert.isFalse(rendered[0].props.otpEnabled);
  });

  test('render do passo identifier (sem e-mail ainda) também carrega otpEnabled por construção', async ({
    assert,
  }) => {
    const { service, rendered } = buildService({
      otpEnabled: true,
      store: makeStore({ otp: true }),
    });
    const ctx = fakeCtx(service, noTableDb()); // sem e-mail na sessão

    await new InteractionController().show(ctx);

    assert.equal(rendered[0].props.step, 'identifier');
    assert.isTrue(rendered[0].props.otpEnabled);
  });
});
