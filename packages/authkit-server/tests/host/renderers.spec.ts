import { test } from '@japa/runner'
import { inertiaRenderer } from '../../src/host/renderers/inertia_renderer.js'
import { edgeRenderer } from '../../src/host/renderers/edge_renderer.js'
import { DEFAULT_MESSAGES } from '../../src/host/i18n.js'

test.group('renderers', () => {
  test('inertiaRenderer chama ctx.inertia.render com prefixo + messages', async ({ assert }) => {
    const calls: any[] = []
    const ctx = { inertia: { render: (name: string, props: any) => calls.push([name, props]) } } as any
    await inertiaRenderer({ prefix: 'authkit' })(ctx, 'login', { uid: 'x' })
    assert.equal(calls[0][0], 'authkit/login')
    assert.equal(calls[0][1].uid, 'x')
    // Sem container/serviço, cai no default pt-BR embutido como shared prop.
    assert.deepEqual(calls[0][1].messages, { ...DEFAULT_MESSAGES })
  })

  test('edgeRenderer chama ctx.view.render com namespace authkit:: + helper t', async ({ assert }) => {
    const calls: any[] = []
    const ctx = { view: { render: (name: string, props: any) => calls.push([name, props]) } } as any
    await edgeRenderer()(ctx, 'account/tokens', { a: 1 })
    assert.equal(calls[0][0], 'authkit::account/tokens')
    assert.equal(calls[0][1].a, 1)
    // `t` é exposto às views e traduz a partir do default em inglês.
    assert.isFunction(calls[0][1].t)
    assert.equal(calls[0][1].t('account.tokens.create'), 'Create')
    assert.equal(calls[0][1].t('login.greeting', { name: 'Ana' }), 'Hi, Ana')
  })
})
