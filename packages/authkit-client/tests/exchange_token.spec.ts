import { test } from '@japa/runner'
import { exchangeToken } from '../src/oidc_login.js'

test.group('exchangeToken', () => {
  test('POSTa o grant token-exchange e mapeia o TokenSet', async ({ assert }) => {
    let captured: { url: string; body: string; headers: any } | null = null
    const fakeFetch = async (url: string, init: any) => {
      captured = { url, body: init.body, headers: init.headers }
      return {
        ok: true,
        json: async () => ({ id_token: 'idt', access_token: 'act', expires_in: 3600 }),
      }
    }

    const ts = await exchangeToken({
      issuer: 'http://idp',
      clientId: 'app1',
      clientSecret: 's',
      subjectToken: 'admin-at',
      requestedSubject: 'target-1',
      scope: 'openid profile email',
      fetchImpl: fakeFetch as any,
    })

    assert.equal(ts.idToken, 'idt')
    assert.equal(ts.accessToken, 'act')
    assert.equal(captured!.url, 'http://idp/token')
    assert.include(captured!.body, 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange')
    assert.include(captured!.body, 'subject_token=admin-at')
    assert.include(captured!.body, 'requested_subject=target-1')
    assert.include(captured!.body, 'client_secret=s')
  })

  test('lança em resposta !ok', async ({ assert }) => {
    const fakeFetch = async () => ({ ok: false, status: 403, json: async () => ({}) })
    await assert.rejects(() =>
      exchangeToken({
        issuer: 'http://idp', clientId: 'a', subjectToken: 't', requestedSubject: 'x',
        fetchImpl: fakeFetch as any,
      })
    )
  })
})
