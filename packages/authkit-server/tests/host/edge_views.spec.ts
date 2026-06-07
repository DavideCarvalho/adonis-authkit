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

test.group('account console views render real (edge.js)', () => {

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
