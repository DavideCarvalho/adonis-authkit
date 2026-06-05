import { test } from '@japa/runner'
import {
  runAllChecks,
  hasErrors,
  checkIssuer,
  checkClients,
  checkAccountStore,
  checkRateLimit,
  checkAdmin,
  checkWebauthn,
  checkRequireVerifiedEmail,
  checkPasswordPolicy,
  checkJwks,
  checkAccessTokens,
  checkBotProtection,
  type DoctorInput,
} from '../src/doctor/checks.js'

function baseInput(overrides: Partial<DoctorInput> = {}): DoctorInput {
  return {
    authkitConfig: {
      issuer: 'https://idp.test/oidc',
      mountPath: '/oidc',
      clients: [{ client_id: 'a', redirectUris: ['https://app/cb'] }],
      accountStore: { findById: () => {}, verifyCredentials: () => {} },
      jwks: { source: 'managed', store: 'tmp/jwks.json' },
    },
    sessionConfig: { store: 'redis' },
    peers: { session: true, shield: true, ally: true, limiter: true },
    ...overrides,
  }
}

test.group('doctor checks', () => {
  test('config saudável não produz erros', ({ assert }) => {
    const findings = runAllChecks(baseInput())
    assert.isFalse(hasErrors(findings))
  })

  test('config ausente vira erro', ({ assert }) => {
    const findings = runAllChecks(baseInput({ authkitConfig: null }))
    assert.isTrue(hasErrors(findings))
  })

  test('issuer pathname != mountPath gera warn', ({ assert }) => {
    const findings = checkIssuer(baseInput({
      authkitConfig: { issuer: 'https://idp.test/auth', mountPath: '/oidc', clients: [] },
    }))
    assert.isTrue(findings.some((f) => f.level === 'warn'))
  })

  test('issuer inválido vira erro', ({ assert }) => {
    const findings = checkIssuer(baseInput({
      authkitConfig: { issuer: 'not a url', mountPath: '/oidc', clients: [] },
    }))
    assert.equal(findings[0].level, 'error')
  })

  test('client sem redirectUris vira erro', ({ assert }) => {
    const f = checkClients(baseInput({
      authkitConfig: { clients: [{ client_id: 'a' }] },
    }))
    assert.equal(f.level, 'error')
  })

  test('accountStore detecta capacidades opt-in', ({ assert }) => {
    const findings = checkAccountStore(baseInput({
      authkitConfig: {
        accountStore: { findById: () => {}, getMfaState: () => {}, listPasskeys: () => {} },
      },
    }))
    const caps = findings.find((f) => f.message.includes('Optional capabilities'))
    assert.include(caps!.message, 'MFA')
    assert.include(caps!.message, 'passkeys')
  })

  test('rate-limit ligado sem limiter vira warn', ({ assert }) => {
    const f = checkRateLimit(baseInput({ peers: { session: true, shield: true, ally: true, limiter: false } }))
    assert.equal(f.level, 'warn')
  })

  test('admin ligado sem roles vira warn', ({ assert }) => {
    const f = checkAdmin(baseInput({
      authkitConfig: { admin: { enabled: true } },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('webauthn rpId divergente do host do issuer vira warn', ({ assert }) => {
    const f = checkWebauthn(baseInput({
      authkitConfig: { issuer: 'https://idp.test/oidc', webauthn: { rpId: 'other.host' } },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('requireVerifiedEmail sem isEmailVerified no store vira warn', ({ assert }) => {
    const f = checkRequireVerifiedEmail(baseInput({
      authkitConfig: {
        login: { requireVerifiedEmail: true },
        accountStore: { findById: () => {} },
      },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('password: sem __passwordConfig no store → check silencioso (null)', ({ assert }) => {
    const f = checkPasswordPolicy(baseInput())
    assert.isNull(f)
  })

  test('password: checkPwned ligado → finding informativo ok', ({ assert }) => {
    const f = checkPasswordPolicy(baseInput({
      authkitConfig: {
        accountStore: {
          findById: () => {},
          __passwordConfig: { policy: { minLength: 12 }, checkPwned: { enabled: true } },
        },
      },
    }))
    assert.equal(f!.level, 'ok')
    assert.include(f!.message, 'HaveIBeenPwned')
  })

  test('password: minLength < 8 → warn', ({ assert }) => {
    const f = checkPasswordPolicy(baseInput({
      authkitConfig: {
        accountStore: {
          findById: () => {},
          __passwordConfig: { policy: { minLength: 4 }, checkPwned: { enabled: false } },
        },
      },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('password: minLength inválido → warn', ({ assert }) => {
    const f = checkPasswordPolicy(baseInput({
      authkitConfig: {
        accountStore: {
          findById: () => {},
          __passwordConfig: { policy: { minLength: -1 }, checkPwned: { enabled: false } },
        },
      },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('requireVerifiedEmail com isEmailVerified no store é ok', ({ assert }) => {
    const f = checkRequireVerifiedEmail(baseInput({
      authkitConfig: {
        login: { requireVerifiedEmail: true },
        accountStore: { findById: () => {}, isEmailVerified: () => {} },
      },
    }))
    assert.equal(f!.level, 'ok')
  })

  test('accountStore detecta email-verification-status e account-deletion', ({ assert }) => {
    const findings = checkAccountStore(baseInput({
      authkitConfig: {
        accountStore: { findById: () => {}, isEmailVerified: () => {}, deleteAccount: () => {} },
      },
    }))
    const caps = findings.find((f) => f.message.includes('Optional capabilities'))
    assert.include(caps!.message, 'email-verification-status')
    assert.include(caps!.message, 'account-deletion')
  })

  test('session cookie store gera warn de tamanho', ({ assert }) => {
    const findings = runAllChecks(baseInput({ sessionConfig: { store: 'cookie' } }))
    assert.isTrue(findings.some((f) => f.level === 'warn' && f.message.includes('cookie')))
  })

  test('jwks managed com store → ok e referencia authkit:keys:rotate', ({ assert }) => {
    const f = checkJwks(baseInput())
    assert.equal(f!.level, 'ok')
    assert.include(f!.message, 'authkit:keys:rotate')
  })

  test('jwks managed SEM store → warn (chave efêmera por boot)', ({ assert }) => {
    const f = checkJwks(baseInput({ authkitConfig: { jwks: { source: 'managed' } } }))
    assert.equal(f!.level, 'warn')
    assert.include(f!.message, 'store')
  })

  test('botProtection ausente → check silencioso (null)', ({ assert }) => {
    assert.isNull(checkBotProtection(baseInput()))
  })

  test('botProtection ligado → ok informa as ações + fail-safe', ({ assert }) => {
    const f = checkBotProtection(baseInput({
      authkitConfig: { botProtection: { verify: () => true, on: ['login', 'reset'] } },
    }))
    assert.equal(f!.level, 'ok')
    assert.include(f!.message, 'login, reset')
    assert.include(f!.message, 'fail-safe')
  })

  test('botProtection sem verify função → warn', ({ assert }) => {
    const f = checkBotProtection(baseInput({
      authkitConfig: { botProtection: { verify: 'nope' } },
    }))
    assert.equal(f!.level, 'warn')
  })

  test('accessTokens: sem config → null (silencioso)', ({ assert }) => {
    const f = checkAccessTokens(baseInput({ authkitConfig: {} }))
    assert.isNull(f)
  })

  test('accessTokens: opaque (default) → ok informativo', ({ assert }) => {
    const f = checkAccessTokens(baseInput({
      authkitConfig: { accessTokens: { format: 'opaque', resources: {}, anyJwt: false } },
    }))
    assert.equal(f!.level, 'ok')
    assert.include(f!.message, 'opaque')
  })

  test('accessTokens: jwt com jwks persistido → ok (RFC 9068)', ({ assert }) => {
    const f = checkAccessTokens(baseInput({
      authkitConfig: {
        jwks: { source: 'managed', store: 'tmp/jwks.json' },
        accessTokens: { format: 'jwt', audience: 'https://idp.test/oidc', resources: {}, anyJwt: true },
      },
    }))
    assert.equal(f!.level, 'ok')
    assert.include(f!.message, 'RFC 9068')
  })

  test('accessTokens: jwt mas jwks managed SEM store → warn', ({ assert }) => {
    const f = checkAccessTokens(baseInput({
      authkitConfig: {
        jwks: { source: 'managed' },
        accessTokens: { format: 'jwt', audience: 'x', resources: {}, anyJwt: true },
      },
    }))
    assert.equal(f!.level, 'warn')
    assert.include(f!.message, 'store')
  })
})
