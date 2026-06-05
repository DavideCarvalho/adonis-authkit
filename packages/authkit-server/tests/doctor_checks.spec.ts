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
  type DoctorInput,
} from '../src/doctor/checks.js'

function baseInput(overrides: Partial<DoctorInput> = {}): DoctorInput {
  return {
    authkitConfig: {
      issuer: 'https://idp.test/oidc',
      mountPath: '/oidc',
      clients: [{ client_id: 'a', redirectUris: ['https://app/cb'] }],
      accountStore: { findById: () => {}, verifyCredentials: () => {} },
      jwks: { source: 'managed' },
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
    const caps = findings.find((f) => f.message.includes('Capacidades'))
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

  test('session cookie store gera warn de tamanho', ({ assert }) => {
    const findings = runAllChecks(baseInput({ sessionConfig: { store: 'cookie' } }))
    assert.isTrue(findings.some((f) => f.level === 'warn' && f.message.includes('cookie')))
  })
})
