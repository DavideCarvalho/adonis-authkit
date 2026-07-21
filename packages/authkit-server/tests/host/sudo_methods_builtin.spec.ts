import { test } from '@japa/runner'
import { password } from '../../src/host/sudo/methods/password.js'
import { passkey } from '../../src/host/sudo/methods/passkey.js'

function ctxWith(cfg: Record<string, unknown>) {
  return { accountId: 'acc-1', account: { id: 'acc-1', email: 'u@e.com' }, returnTo: null, cfg, ctx: {} } as any
}

test.group('sudoMethods.password', () => {
  test('disponível quando a conta tem hash de senha', async ({ assert }) => {
    const c = ctxWith({ accountStore: { async __getRawRow() { return { password: 'hash' } } } })
    assert.isTrue(await password().isAvailable(c))
  })

  test('indisponível quando o hash está vazio', async ({ assert }) => {
    const c = ctxWith({ accountStore: { async __getRawRow() { return { password: '' } } } })
    assert.isFalse(await password().isAvailable(c))
  })

  test('indisponível quando o store não expõe __getRawRow', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    assert.isFalse(await password().isAvailable(c))
  })

  test('descreve um form com o campo password', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    const d = await password().describe(c)
    assert.equal(d.kind, 'form')
    assert.equal(d.endpoint, '/account/confirm')
    assert.deepEqual(d.fields?.map((f) => f.name), ['password'])
  })
})

test.group('sudoMethods.passkey', () => {
  test('disponível quando há passkey cadastrada', async ({ assert }) => {
    const c = ctxWith({
      accountStore: {
        listPasskeys: async () => [{ id: 'pk-1' }],
        generatePasskeyAuthenticationOptions: async () => ({}),
        verifyPasskeyAuthentication: async () => true,
      },
    })
    assert.isTrue(await passkey().isAvailable(c))
  })

  test('indisponível quando não há passkey cadastrada', async ({ assert }) => {
    const c = ctxWith({
      accountStore: {
        listPasskeys: async () => [],
        generatePasskeyAuthenticationOptions: async () => ({}),
        verifyPasskeyAuthentication: async () => true,
      },
    })
    assert.isFalse(await passkey().isAvailable(c))
  })

  test('indisponível quando o store não suporta passkeys', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    assert.isFalse(await passkey().isAvailable(c))
  })

  test('descreve uma action na URL legada', async ({ assert }) => {
    const c = ctxWith({ accountStore: {} })
    const d = await passkey().describe(c)
    assert.equal(d.kind, 'action')
    assert.equal(d.endpoint, '/account/confirm/passkey')
  })
})
