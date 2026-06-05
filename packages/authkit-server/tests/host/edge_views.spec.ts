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

  test('account/security.edge expõe os forms de senha e e-mail com CSRF', ({ assert }) => {
    const content = read('account/security.edge')
    assert.include(content, 'action="/account/security/password"')
    assert.include(content, 'action="/account/security/email"')
    assert.include(content, 'name="currentPassword"')
    assert.include(content, 'name="newPassword"')
    assert.include(content, 'name="newEmail"')
    assert.include(content, 'name="_csrf"')
    assert.include(content, '@if(!supported)')
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

  test('sessions.edge existe, degrada e expõe a rota de revogação', ({ assert }) => {
    assert.isTrue(existsSync(dir + 'admin/sessions.edge'))
    const content = read('admin/sessions.edge')
    assert.include(content, '@if(!supported)')
    assert.include(content, '/admin/users/{{ accountId }}/revoke-sessions')
    assert.include(content, 'name="_csrf"')
  })

  test('users.edge linka a página de sessões da conta', ({ assert }) => {
    assert.include(read('admin/users.edge'), '/admin/users/{{ user.id }}/sessions')
  })
})

test.group('account console views render real (edge.js)', () => {
  test('sessions.edge renderiza sessões + grants e o banner de revogação', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::admin/sessions', {
      csrfToken: 'csrf',
      supported: true,
      accountId: 'acc-1',
      email: 'u@x.com',
      revoked: { sessions: 1, grants: 2, accessTokens: 3, refreshTokens: 1 },
      sessions: [{ id: 'sess1', loginTs: '2024-01-01T00:00:00Z', amr: 'pwd' }],
      grants: [{ id: 'grant-1', clientId: 'c1', accessTokens: 2, refreshTokens: 1 }],
    })
    assert.include(html, 'sess1')
    assert.include(html, 'grant-1')
    assert.include(html, '/admin/users/acc-1/revoke-sessions')
    assert.include(html, 'csrf')
  })

  test('sessions.edge degrada quando o adapter não enumera', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::admin/sessions', {
      csrfToken: 't',
      supported: false,
      accountId: 'acc-1',
      email: 'u@x.com',
      revoked: null,
      sessions: [],
      grants: [],
    })
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'admin.sessions.not_supported'))
    assert.notInclude(html, '/revoke-sessions')
  })

  test('account/security.edge renderiza os dois formulários + perfil', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::account/security', {
      csrfToken: 'csrf',
      supported: true,
      profileSupported: true,
      email: 'u@x.com',
      name: 'Old Name',
      avatarUrl: 'https://x/a.png',
      passwordChanged: null,
      emailChangeRequested: null,
      emailChanged: null,
      profileUpdated: null,
      error: null,
    })
    assert.include(html, 'action="/account/security/password"')
    assert.include(html, 'action="/account/security/email"')
    assert.include(html, 'action="/account/security/profile"')
    assert.include(html, 'Old Name')
    assert.include(html, '/account/apps')
    assert.include(html, 'csrf')
  })

  test('account/apps.edge renderiza apps com revogação e degrada sem enumeração', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::account/apps', {
      csrfToken: 'csrf',
      supported: true,
      revoked: null,
      apps: [{ clientId: 'c1', name: 'c1', accessTokens: 2, refreshTokens: 1 }],
    })
    assert.include(html, 'action="/account/apps/c1/revoke"')
    assert.include(html, 'name="_csrf"')

    const degraded = await edge.render('authkit::account/apps', {
      csrfToken: 't',
      supported: false,
      revoked: null,
      apps: [],
    })
    assert.include(degraded, translate({ ...DEFAULT_MESSAGES }, 'account.apps.not_supported'))
    assert.notInclude(degraded, '/revoke')
  })

  test('admin/users.edge renderiza criar/reset/disable + badge desabilitada', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::admin/users', {
      csrfToken: 'csrf',
      search: '',
      page: 1,
      totalPages: 1,
      total: 1,
      statusSupported: true,
      created: null,
      resetSent: null,
      statusChanged: null,
      error: null,
      users: [
        {
          id: 'u1',
          email: 'a@b.com',
          name: 'Al',
          roles: [],
          rolesText: '',
          disabled: true,
        },
      ],
    })
    assert.include(html, 'action="/admin/users"')
    assert.include(html, '/admin/users/u1/reset-password')
    assert.include(html, '/admin/users/u1/enable')
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'admin.users.disabled_badge'))
  })

  test('account/email-confirmed.edge mostra sucesso/falha conforme `ok`', async ({ assert }) => {
    const edge = makeEdge()
    const okHtml = await edge.render('authkit::account/email-confirmed', { ok: true })
    assert.include(okHtml, translate({ ...DEFAULT_MESSAGES }, 'account.email_confirmed.ok_title'))
    const failHtml = await edge.render('authkit::account/email-confirmed', { ok: false })
    assert.include(
      failHtml,
      translate({ ...DEFAULT_MESSAGES }, 'account.email_confirmed.invalid_title')
    )
  })
})

test.group('R4 login views render real (edge.js)', () => {
  test('login.edge (password) mostra magic link + passkey-first quando disponíveis', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::login', {
      uid: 'i1',
      csrfToken: 'csrf',
      step: 'password',
      email: 'u@x.com',
      account: null,
      brand: { appName: 'X' },
      magicLinkAvailable: true,
      passkeyFirstAvailable: true,
    })
    assert.include(html, '/auth/interaction/i1/magic')
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'login.magic_link_button'))
    assert.include(html, '/auth/interaction/i1/passkey/verify')
    assert.include(html, '/auth/interaction/i1/passkey/options')
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'login.passkey_button'))
  })

  test('login.edge esconde passwordless quando indisponível e mostra "link enviado"', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const off = await edge.render('authkit::login', {
      uid: 'i1',
      csrfToken: 'c',
      step: 'password',
      email: 'u@x.com',
      account: null,
      brand: { appName: 'X' },
      magicLinkAvailable: false,
      passkeyFirstAvailable: false,
    })
    assert.notInclude(off, translate({ ...DEFAULT_MESSAGES }, 'login.magic_link_button'))
    assert.notInclude(off, translate({ ...DEFAULT_MESSAGES }, 'login.passkey_button'))

    const sent = await edge.render('authkit::login', {
      uid: 'i1',
      csrfToken: 'c',
      step: 'password',
      email: 'u@x.com',
      account: null,
      brand: { appName: 'X' },
      magicLinkAvailable: true,
      magicLinkSent: true,
    })
    assert.include(sent, translate({ ...DEFAULT_MESSAGES }, 'login.magic_link_sent'))
  })

  test('mfa-challenge.edge mostra a checkbox de trusted device quando ligado', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::mfa-challenge', {
      uid: 'i1',
      csrfToken: 'csrf',
      brand: { appName: 'X' },
      passkeyAvailable: false,
      trustedDevicesEnabled: true,
      trustedDeviceDays: 30,
    })
    assert.include(html, 'name="trustDevice"')
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'mfa_challenge.trust_device', { days: 30 }))

    const off = await edge.render('authkit::mfa-challenge', {
      uid: 'i1',
      csrfToken: 'csrf',
      brand: { appName: 'X' },
      passkeyAvailable: false,
      trustedDevicesEnabled: false,
      trustedDeviceDays: 30,
    })
    assert.notInclude(off, 'name="trustDevice"')
  })

  test('account/security.edge mostra a seção de trusted devices + revogação', async ({
    assert,
  }) => {
    const edge = makeEdge()
    const html = await edge.render('authkit::account/security', {
      csrfToken: 'csrf',
      supported: true,
      profileSupported: false,
      email: 'u@x.com',
      name: '',
      avatarUrl: '',
      passwordChanged: null,
      emailChangeRequested: null,
      emailChanged: null,
      profileUpdated: null,
      error: null,
      trustedDevicesEnabled: true,
      trustedDevicesRevoked: null,
    })
    assert.include(html, 'action="/account/security/trusted-devices/revoke"')
    assert.include(
      html,
      translate({ ...DEFAULT_MESSAGES }, 'account.security.trusted_devices_revoke')
    )
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
