import { test } from '@japa/runner'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Edge } from 'edge.js'
import { DEFAULT_MESSAGES, translate } from '../../src/host/i18n.js'

const dir = fileURLToPath(new URL('../../src/host/views/', import.meta.url))
const read = (p: string) => readFileSync(dir + p, 'utf8')

/** Instancia um Edge real montando as views da lib + o helper `t` (igual produção). */
function makeEdge() {
  const edge = new Edge()
  edge.mount('authkit', dir)
  edge.global('t', (key: string, params?: Record<string, string | number>) =>
    translate({ ...DEFAULT_MESSAGES }, key, params)
  )
  return edge
}

test.group('edge views (lib-owned)', () => {
  test('as 7 views existem', ({ assert }) => {
    for (const v of [
      'login.edge',
      'consent.edge',
      'signup.edge',
      'forgot.edge',
      'reset.edge',
      'account/login.edge',
      'account/tokens.edge',
    ]) {
      assert.isTrue(existsSync(dir + v), `falta ${v}`)
    }
  })

  test('actions de formulário corretas', ({ assert }) => {
    assert.include(read('login.edge'), '/auth/interaction/')
    assert.include(read('signup.edge'), '/auth/interaction/')
    assert.include(read('forgot.edge'), '/auth/forgot-password')
    assert.include(read('reset.edge'), '/auth/reset-password')
    assert.include(read('account/login.edge'), '/account/login')
    assert.include(read('account/tokens.edge'), '/account/tokens')
  })

  test('campos CSRF presentes em todos os formulários POST', ({ assert }) => {
    for (const v of [
      'login.edge',
      'consent.edge',
      'signup.edge',
      'forgot.edge',
      'reset.edge',
      'account/login.edge',
      'account/tokens.edge',
    ]) {
      assert.include(read(v), 'name="_csrf"', `${v} está sem campo _csrf`)
    }
  })

  test('login.edge tem branches @if(step === "identifier") e @else', ({ assert }) => {
    const content = read('login.edge')
    assert.include(content, "step === 'identifier'")
    assert.include(content, '@else')
    assert.include(content, '/identifier')
    assert.include(content, '/login')
  })

  test('forgot.edge tem branch @if(sent)', ({ assert }) => {
    assert.include(read('forgot.edge'), '@if(sent)')
  })

  test('reset.edge tem branch @if(done) e campo hidden token', ({ assert }) => {
    const content = read('reset.edge')
    assert.include(content, '@if(done)')
    assert.include(content, 'name="token"')
  })

  test('account/tokens.edge tem @each(token in tokens) e rota de revogação', ({ assert }) => {
    const content = read('account/tokens.edge')
    assert.include(content, '@each(token in tokens)')
    assert.include(content, '/account/tokens/{{ token.id }}/revoke')
  })
})

test.group('admin views (B6)', () => {
  test('as 5 views admin existem (inclui client_form)', ({ assert }) => {
    for (const v of [
      'admin/dashboard.edge',
      'admin/users.edge',
      'admin/clients.edge',
      'admin/client_form.edge',
      'admin/audit.edge',
    ]) {
      assert.isTrue(existsSync(dir + v), `falta ${v}`)
    }
  })

  test('forms POST das views admin têm campo CSRF', ({ assert }) => {
    // users.edge tem o form de roles; todas têm o form de logout.
    assert.include(read('admin/users.edge'), 'name="_csrf"')
    assert.include(read('admin/users.edge'), '/admin/users/{{ user.id }}/roles')
    assert.include(read('admin/dashboard.edge'), 'name="_csrf"')
    assert.include(read('admin/client_form.edge'), 'name="_csrf"')
    assert.include(read('admin/clients.edge'), 'name="_csrf"')
  })

  test('audit.edge degrada quando consulta não suportada', ({ assert }) => {
    assert.include(read('admin/audit.edge'), '@if(!supported)')
  })

  test('clients.edge degrada quando o adapter não enumera', ({ assert }) => {
    assert.include(read('admin/clients.edge'), '@if(!dynamicSupported)')
  })

  test('clients.edge expõe rotas de CRUD dinâmico', ({ assert }) => {
    const content = read('admin/clients.edge')
    assert.include(content, '/admin/clients/new')
    assert.include(content, '/admin/clients/{{ client.clientId }}/edit')
    assert.include(content, '/admin/clients/{{ client.clientId }}/regenerate-secret')
    assert.include(content, '/admin/clients/{{ client.clientId }}/delete')
  })
})

test.group('admin views render real (edge.js)', () => {
  test('clients.edge renderiza listas estática + dinâmica e o banner de secret', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::admin/clients', {
      csrfToken: 'csrf-token-xyz',
      dynamicEnabled: true,
      dynamicSupported: true,
      createdSecret: { clientId: 'cli_abc', clientSecret: 'sec_123' },
      staticClients: [
        {
          clientId: 'static1',
          confidential: true,
          grants: ['authorization_code'],
          redirectUris: ['https://app/cb'],
          postLogoutRedirectUris: [],
        },
      ],
      dynamicClients: [
        {
          clientId: 'dyn1',
          confidential: true,
          grants: ['authorization_code', 'refresh_token'],
          redirectUris: ['https://dyn/cb'],
          postLogoutRedirectUris: [],
          tokenEndpointAuthMethod: 'client_secret_basic',
        },
      ],
    })
    assert.include(html, 'csrf-token-xyz')
    assert.include(html, 'static1')
    assert.include(html, 'dyn1')
    assert.include(html, 'sec_123') // secret mostrado uma vez
    assert.include(html, '/admin/clients/dyn1/edit')
    assert.include(html, '/admin/clients/dyn1/delete')
    assert.include(html, '/admin/clients/dyn1/regenerate-secret')
  })

  test('clients.edge degrada graciosamente sem listClients', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::admin/clients', {
      csrfToken: 't',
      dynamicEnabled: false,
      dynamicSupported: false,
      createdSecret: null,
      staticClients: [],
      dynamicClients: [],
    })
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'admin.clients.dynamic_not_supported'))
    assert.notInclude(html, '/admin/clients/new')
  })

  test('client_form.edge renderiza modo create (sem disabled) e edit (campo disabled)', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const createHtml = await edge.render('authkit::admin/client_form', {
      csrfToken: 'csrf',
      mode: 'create',
      client: {
        clientId: '',
        redirectUris: [],
        postLogoutRedirectUris: [],
        grants: ['authorization_code', 'refresh_token'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      },
    })
    assert.include(createHtml, 'action="/admin/clients"')
    assert.include(createHtml, 'name="client_id"')
    assert.include(createHtml, 'name="redirect_uris"')

    const editHtml = await edge.render('authkit::admin/client_form', {
      csrfToken: 'csrf',
      mode: 'edit',
      client: {
        clientId: 'dyn1',
        redirectUris: ['https://dyn/cb'],
        postLogoutRedirectUris: [],
        grants: ['authorization_code'],
        tokenEndpointAuthMethod: 'client_secret_basic',
      },
    })
    assert.include(editHtml, 'action="/admin/clients/dyn1/edit"')
    assert.include(editHtml, 'disabled')
    assert.include(editHtml, 'https://dyn/cb')
  })
})
