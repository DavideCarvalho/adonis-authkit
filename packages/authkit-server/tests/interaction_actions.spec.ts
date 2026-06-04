import { test } from '@japa/runner'
import { createInteractionActions } from '../src/provider/interaction_actions.js'

function fakeProvider() {
  const calls: any = { finished: null, grantSaved: false }
  class Grant {
    accountId: string; clientId: string; scopes: string[] = []
    constructor(o: { accountId: string; clientId: string }) { this.accountId = o.accountId; this.clientId = o.clientId }
    addOIDCScope(s: string) { this.scopes.push(s) }
    async save() { calls.grantSaved = true; return 'grant-1' }
  }
  return {
    calls,
    Grant,
    async interactionDetails() { return { uid: 'i1', prompt: { name: 'consent' }, params: { client_id: 'app1', scope: 'openid email' }, session: { accountId: 'u1' } } },
    async interactionFinished(_req: any, _res: any, result: any) { calls.finished = result; return 'redirected' },
  } as any
}
const ctx = { request: { request: {} }, response: { response: {} } } as any

test.group('createInteractionActions', () => {
  test('login com credenciais válidas chama interactionFinished({login})', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, { verifyCredentials: async () => ({ id: 'u1' }) })
    const r = await actions.login(ctx, { email: 'a@b.com', password: 'ok' })
    assert.isTrue(r.ok)
    assert.deepEqual(provider.calls.finished, { login: { accountId: 'u1' } })
  })

  test('login inválido NÃO chama interactionFinished', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, { verifyCredentials: async () => null })
    const r = await actions.login(ctx, { email: 'x', password: 'y' })
    assert.isFalse(r.ok)
    assert.isNull(provider.calls.finished)
  })

  test('login sem verifyCredentials configurado lança erro claro', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    await assert.rejects(() => actions.login(ctx, { email: 'a', password: 'b' }), /verifyCredentials/)
  })

  test('consent monta Grant e chama interactionFinished({consent})', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    await actions.consent(ctx)
    assert.isTrue(provider.calls.grantSaved)
    assert.deepEqual(provider.calls.finished, { consent: { grantId: 'grant-1' } })
  })

  test('completeLogin com extra step-up propaga acr/amr para o interactionFinished', async ({
    assert,
  }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    await actions.completeLogin(ctx, 'u1', { acr: 'urn:authkit:mfa', amr: ['mfa', 'totp'] })
    assert.deepEqual(provider.calls.finished, {
      login: { accountId: 'u1', acr: 'urn:authkit:mfa', amr: ['mfa', 'totp'] },
    })
  })

  test('completeLogin sem extra NÃO inclui acr/amr (default)', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    await actions.completeLogin(ctx, 'u1', { amr: [] })
    assert.deepEqual(provider.calls.finished, { login: { accountId: 'u1' } })
  })

  test('details devolve o interactionDetails', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    const d = await actions.details(ctx)
    assert.equal(d.uid, 'i1')
  })

  test('completeLogin chama interactionFinished({login}) com o accountId dado', async ({ assert }) => {
    const provider = fakeProvider()
    const actions = createInteractionActions(provider, {})
    const r = await actions.completeLogin(ctx, 'u-google-1')
    assert.isTrue(r.ok)
    assert.deepEqual(provider.calls.finished, { login: { accountId: 'u-google-1' } })
  })
})
