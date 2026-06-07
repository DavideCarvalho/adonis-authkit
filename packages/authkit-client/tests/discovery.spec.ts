import { test } from '@japa/runner'
import {
  discoverEndpoints,
  conventionEndpoints,
  __clearDiscoveryCacheForTests,
} from '../src/discovery.js'
import { buildAuthorizeUrl, buildEndSessionUrl, exchangeCode } from '../src/oidc_login.js'

const ISSUER = 'https://idp.example.com/realms/acme'

const KEYCLOAK_DOC = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
  userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
  introspection_endpoint: `${ISSUER}/protocol/openid-connect/token/introspect`,
}

function fakeFetch(handler: (url: string) => { status: number; json?: unknown }) {
  return (async (input: any) => {
    const result = handler(String(input))
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.json,
    } as Response
  }) as typeof fetch
}

test.group('discoverEndpoints', (group) => {
  group.each.setup(() => __clearDiscoveryCacheForTests())

  test('resolve endpoints reais do documento de discovery (estilo Keycloak)', async ({ assert }) => {
    const endpoints = await discoverEndpoints(ISSUER, {
      fetchImpl: fakeFetch((url) => {
        assert.equal(url, `${ISSUER}/.well-known/openid-configuration`)
        return { status: 200, json: KEYCLOAK_DOC }
      }),
    })
    assert.equal(endpoints.authorizationEndpoint, KEYCLOAK_DOC.authorization_endpoint)
    assert.equal(endpoints.tokenEndpoint, KEYCLOAK_DOC.token_endpoint)
    assert.equal(endpoints.jwksUri, KEYCLOAK_DOC.jwks_uri)
    assert.equal(endpoints.endSessionEndpoint, KEYCLOAK_DOC.end_session_endpoint)
    assert.equal(endpoints.userinfoEndpoint, KEYCLOAK_DOC.userinfo_endpoint)
    assert.equal(endpoints.introspectionEndpoint, KEYCLOAK_DOC.introspection_endpoint)
  })

  test('campos ausentes no documento caem na convenção do oidc-provider', async ({ assert }) => {
    const endpoints = await discoverEndpoints(ISSUER, {
      fetchImpl: fakeFetch(() => ({
        status: 200,
        json: { token_endpoint: `${ISSUER}/custom/token` },
      })),
    })
    assert.equal(endpoints.tokenEndpoint, `${ISSUER}/custom/token`)
    assert.equal(endpoints.authorizationEndpoint, `${ISSUER}/auth`)
    assert.equal(endpoints.jwksUri, `${ISSUER}/jwks`)
  })

  test('falha de rede/404 → fallback completo para convenção', async ({ assert }) => {
    const from404 = await discoverEndpoints('https://a.example.com', {
      fetchImpl: fakeFetch(() => ({ status: 404 })),
    })
    assert.deepEqual(from404, conventionEndpoints('https://a.example.com'))

    const fromThrow = await discoverEndpoints('https://b.example.com', {
      fetchImpl: (async () => {
        throw new Error('network down')
      }) as any,
    })
    assert.deepEqual(fromThrow, conventionEndpoints('https://b.example.com'))
  })

  test('cache por issuer: segunda chamada não refaz o fetch', async ({ assert }) => {
    let calls = 0
    const fetchImpl = fakeFetch(() => {
      calls++
      return { status: 200, json: KEYCLOAK_DOC }
    })
    await discoverEndpoints(ISSUER, { fetchImpl })
    await discoverEndpoints(ISSUER, { fetchImpl })
    assert.equal(calls, 1)
  })

  test('overrides manuais vencem o documento, campo a campo', async ({ assert }) => {
    const endpoints = await discoverEndpoints(ISSUER, {
      fetchImpl: fakeFetch(() => ({ status: 200, json: KEYCLOAK_DOC })),
      overrides: { tokenEndpoint: 'https://proxy.internal/token' },
    })
    assert.equal(endpoints.tokenEndpoint, 'https://proxy.internal/token')
    assert.equal(endpoints.authorizationEndpoint, KEYCLOAK_DOC.authorization_endpoint)
  })

  test('issuer com barra final normaliza igual', async ({ assert }) => {
    const a = conventionEndpoints('https://x.example.com/')
    const b = conventionEndpoints('https://x.example.com')
    assert.deepEqual(a, b)
  })
})

test.group('flow helpers + endpoints descobertos', () => {
  test('buildAuthorizeUrl usa o authorizationEndpoint quando fornecido', ({ assert }) => {
    const url = buildAuthorizeUrl({
      issuer: ISSUER,
      clientId: 'app',
      redirectUri: 'https://app/cb',
      scopes: ['openid'],
      state: 's1',
      codeChallenge: 'c1',
      authorizationEndpoint: KEYCLOAK_DOC.authorization_endpoint,
    })
    assert.isTrue(url.startsWith(`${KEYCLOAK_DOC.authorization_endpoint}?`))
    assert.include(url, 'code_challenge_method=S256')
  })

  test('buildAuthorizeUrl sem endpoint mantém a convenção (back-compat)', ({ assert }) => {
    const url = buildAuthorizeUrl({
      issuer: ISSUER,
      clientId: 'app',
      redirectUri: 'https://app/cb',
      scopes: ['openid'],
      state: 's1',
      codeChallenge: 'c1',
    })
    assert.isTrue(url.startsWith(`${ISSUER}/auth?`))
  })

  test('buildEndSessionUrl usa endSessionEndpoint quando fornecido', ({ assert }) => {
    const url = buildEndSessionUrl({
      issuer: ISSUER,
      idToken: 'idt',
      endSessionEndpoint: KEYCLOAK_DOC.end_session_endpoint,
    })
    assert.isTrue(url.startsWith(`${KEYCLOAK_DOC.end_session_endpoint}?`))
  })

  test('exchangeCode posta no tokenEndpoint quando fornecido', async ({ assert }) => {
    let posted: string | null = null
    await exchangeCode({
      issuer: ISSUER,
      clientId: 'app',
      redirectUri: 'https://app/cb',
      code: 'code1',
      codeVerifier: 'v1',
      tokenEndpoint: KEYCLOAK_DOC.token_endpoint,
      fetchImpl: (async (url: any) => {
        posted = String(url)
        return { ok: true, json: async () => ({ access_token: 'at' }) } as Response
      }) as typeof fetch,
    })
    assert.equal(posted, KEYCLOAK_DOC.token_endpoint)
  })
})
