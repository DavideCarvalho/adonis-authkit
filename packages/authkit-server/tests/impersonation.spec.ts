import { test } from '@japa/runner';
import { buildImpersonationPanel } from '../src/host/impersonation.js';

/** Config mínima com clients para os testes. */
function cfg(clients: any[]) {
  return { issuer: 'https://idp.example.com', clients } as any;
}

const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

test.group('buildImpersonationPanel (RFC 8693 token exchange)', () => {
  test('sem client com token-exchange → null (fluxo não disponível)', ({ assert }) => {
    const result = buildImpersonationPanel(
      cfg([
        {
          clientId: 'web',
          clientSecret: 'sec',
          redirectUris: ['https://app/cb'],
          grants: ['authorization_code', 'refresh_token'],
        },
      ]),
      'target-user-id',
    );
    assert.isNull(result);
  });

  test('com client confidencial (secret) → monta curl com -u', ({ assert }) => {
    const result = buildImpersonationPanel(
      cfg([
        {
          clientId: 'admin-cli',
          clientSecret: 'sec-abc',
          redirectUris: ['https://app/cb'],
          grants: [TOKEN_EXCHANGE],
        },
      ]),
      'user-42',
    );
    assert.isNotNull(result);
    assert.equal(result!.tokenEndpoint, 'https://idp.example.com/token');
    assert.equal(result!.grantType, TOKEN_EXCHANGE);
    assert.equal(result!.subjectTokenType, ACCESS_TOKEN_TYPE);
    assert.equal(result!.requestedSubject, 'user-42');
    assert.equal(result!.clientId, 'admin-cli');
    // curl usa auth HTTP basic (-u)
    assert.include(result!.curl, "-u 'admin-cli:sec-abc'");
    assert.include(result!.curl, `grant_type=${TOKEN_EXCHANGE}`);
    assert.include(result!.curl, 'subject_token=<ADMIN_ACCESS_TOKEN>');
    assert.include(result!.curl, 'requested_subject=user-42');
  });

  test('com client público (sem secret) → curl usa -d client_id', ({ assert }) => {
    const result = buildImpersonationPanel(
      cfg([
        {
          clientId: 'public-cli',
          // sem clientSecret
          redirectUris: ['https://app/cb'],
          grants: [TOKEN_EXCHANGE],
        },
      ]),
      'user-99',
    );
    assert.isNotNull(result);
    assert.include(result!.curl, 'client_id=public-cli');
    assert.notInclude(result!.curl, '-u ');
  });

  test('escolhe o PRIMEIRO client com o grant (quando há vários)', ({ assert }) => {
    const result = buildImpersonationPanel(
      cfg([
        {
          clientId: 'no-exchange',
          clientSecret: 'x',
          redirectUris: ['https://app/cb'],
          grants: ['authorization_code'],
        },
        {
          clientId: 'has-exchange',
          clientSecret: 'y',
          redirectUris: ['https://app/cb'],
          grants: [TOKEN_EXCHANGE],
        },
      ]),
      'user-1',
    );
    assert.isNotNull(result);
    assert.equal(result!.clientId, 'has-exchange');
  });

  test('issuer com trailing slash é normalizado no tokenEndpoint', ({ assert }) => {
    const result = buildImpersonationPanel(
      {
        issuer: 'https://idp.example.com/',
        clients: [
          { clientId: 'cli', clientSecret: 'sec', grants: [TOKEN_EXCHANGE], redirectUris: [] },
        ],
      } as any,
      'target',
    );
    assert.equal(result!.tokenEndpoint, 'https://idp.example.com/token');
  });

  test('shape completo do retorno tem todos os campos esperados', ({ assert }) => {
    const result = buildImpersonationPanel(
      cfg([
        {
          clientId: 'c1',
          clientSecret: 's1',
          redirectUris: [],
          grants: [TOKEN_EXCHANGE],
        },
      ]),
      'uid-1',
    );
    assert.isNotNull(result);
    const expectedKeys = [
      'tokenEndpoint',
      'grantType',
      'subjectTokenType',
      'requestedSubject',
      'clientId',
      'curl',
    ];
    for (const key of expectedKeys) {
      assert.property(result!, key, `campo '${key}' deve estar presente`);
    }
  });
});

test.group('impersonation gate (sempre OFF no config — política via runtime setting)', () => {
  test('resolveAdmin → impersonation sempre false (gerido via admin_impersonation setting)', async ({
    assert,
  }) => {
    const { resolveAdmin } = await import('../src/define_config.js');
    const resolved = resolveAdmin({ enabled: true });
    assert.isFalse(resolved.impersonation);
  });

  test('resolveAdmin sem config → impersonation false (default conservador)', async ({
    assert,
  }) => {
    const { resolveAdmin } = await import('../src/define_config.js');
    const resolved = resolveAdmin(undefined);
    assert.isFalse(resolved.impersonation);
  });
});
