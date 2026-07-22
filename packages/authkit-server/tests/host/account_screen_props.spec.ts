/**
 * Exports públicos para hosts com telas React próprias:
 *
 *  (A) Tipos de props das telas de conta (`AccountLoginProps`, `AccountSecurityProps`,
 *      `AccountMfaProps`, `AccountConfirmProps`, `AccountEmailConfirmedProps`) — a
 *      garantia de que eles NÃO divergem do que os controllers renderizam é de
 *      COMPILAÇÃO (os controllers usam `satisfies Omit<…, 'messages'>`, checado pelo
 *      `tsc` do pacote). Aqui basta o smoke de import público + a prova de que um
 *      objeto do shape documentado é atribuível ao tipo (checado pelo ts-exec).
 *
 *  (B) Helpers de path (`accountPath`/`joinAccountPath`/`accountPrefix`): importáveis
 *      do entrypoint e apontando para o MESMO singleton que `registerAuthHost` seta —
 *      um override feito via `setAccountPaths` (o que `accountRoutes` faz no boot) é
 *      refletido pelos helpers re-exportados do index.
 */

import { test } from '@japa/runner';
import {
  type AccountConfirmProps,
  type AccountEmailConfirmedProps,
  type AccountLoginProps,
  type AccountMfaProps,
  type AccountSecurityProps,
  accountPath,
  accountPrefix,
  joinAccountPath,
} from '../../index.js';
// setAccountPaths/resetAccountPaths não fazem parte da superfície pública (só o
// registro os chama); importados do módulo interno para simular o override.
import { resetAccountPaths, setAccountPaths } from '../../src/host/account_paths.js';
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js';

const PT = { prefix: '/conta', paths: { security: 'seguranca', confirm: 'confirmar' } };

test.group('exports públicos: tipos de props das telas de conta', () => {
  test('os cinco tipos são importáveis do entrypoint e aceitam o shape documentado', ({
    assert,
  }) => {
    const messages = { ...DEFAULT_MESSAGES };

    const login: AccountLoginProps = {
      csrfToken: 'csrf',
      returnTo: '/conta/seguranca',
      error: 'x',
      messages,
    };
    const security: AccountSecurityProps = {
      csrfToken: 'csrf',
      supported: true,
      profileSupported: true,
      avatarUploadSupported: false,
      email: 'u@e.com',
      name: 'U',
      avatarUrl: '',
      passwordChanged: null,
      emailChangeRequested: null,
      emailChanged: null,
      profileUpdated: null,
      error: null,
      trustedDevicesEnabled: false,
      trustedDevicesRevoked: null,
      sessionsSupported: true,
      sessions: [{ loginTs: '', browser: 'Chrome', os: 'Linux', ip: '', location: '' }],
      exportSupported: true,
      deletionSupported: false,
      deleteError: null,
      messages,
    };
    const mfa: AccountMfaProps = {
      csrfToken: 'csrf',
      enabled: false,
      recoveryCodes: null,
      passkeysSupported: true,
      passkeys: [{ id: 'abc', createdAt: '2026-01-01T00:00:00Z' }],
      messages,
    };
    // O passo de enroll varia o shape (props opcionais) — também é atribuível.
    const mfaEnroll: AccountMfaProps = {
      csrfToken: 'csrf',
      enabled: false,
      enrolling: true,
      secret: 'BASE32',
      qrDataUrl: 'data:image/png;base64,AAA',
      recoveryCodes: null,
      messages,
    };
    const confirm: AccountConfirmProps = {
      csrfToken: 'csrf',
      returnTo: null,
      error: null,
      notice: null,
      methods: [
        { id: 'password', labelKey: 'k', kind: 'form', endpoint: '/conta/confirmar' },
        { id: 'passkey', labelKey: 'k', kind: 'webauthn', endpoint: '/conta/confirmar/passkey' },
      ],
      preferredId: null,
      messages,
    };
    const emailConfirmed: AccountEmailConfirmedProps = { ok: true, messages };

    // Runtime assertions (o valor de garantia de tipo é a atribuição acima, que
    // o ts-exec compila; aqui só provamos que os objetos existem).
    assert.equal(login.csrfToken, 'csrf');
    assert.isTrue(security.exportSupported);
    assert.isNull(mfa.recoveryCodes);
    assert.isTrue(mfaEnroll.enrolling);
    assert.lengthOf(confirm.methods, 2);
    assert.equal(confirm.methods[1]!.kind, 'webauthn');
    assert.isTrue(emailConfirmed.ok);
  });
});

test.group('exports públicos: helpers de path do console de conta', (group) => {
  group.each.teardown(() => resetAccountPaths());

  test('accountPath/joinAccountPath/accountPrefix são importáveis do entrypoint', ({ assert }) => {
    assert.isFunction(accountPath);
    assert.isFunction(joinAccountPath);
    assert.isFunction(accountPrefix);
  });

  test('sem overrides os helpers refletem os defaults (/account/*)', ({ assert }) => {
    assert.equal(accountPrefix(), '/account');
    assert.equal(accountPath('security'), '/account/security');
    assert.equal(joinAccountPath('api'), '/account/api');
  });

  test('os helpers do entrypoint refletem os overrides do singleton (accountRoutes)', ({
    assert,
  }) => {
    // setAccountPaths é o que `registerAuthHost` chama no boot com `accountRoutes`.
    setAccountPaths(PT);
    // Os helpers re-exportados do index leem o MESMO singleton.
    assert.equal(accountPrefix(), '/conta');
    assert.equal(accountPath('security'), '/conta/seguranca');
    assert.equal(accountPath('confirm'), '/conta/confirmar');
    assert.equal(joinAccountPath('api'), '/conta/api');
  });
});
