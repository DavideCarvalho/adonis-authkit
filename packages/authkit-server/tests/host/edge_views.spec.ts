import { test } from '@japa/runner'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../../src/host/views/', import.meta.url))
const read = (p: string) => readFileSync(dir + p, 'utf8')

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
  test('as 4 views admin existem', ({ assert }) => {
    for (const v of ['admin/dashboard.edge', 'admin/users.edge', 'admin/clients.edge', 'admin/audit.edge']) {
      assert.isTrue(existsSync(dir + v), `falta ${v}`)
    }
  })

  test('forms POST das views admin têm campo CSRF', ({ assert }) => {
    // users.edge tem o form de roles; todas têm o form de logout.
    assert.include(read('admin/users.edge'), 'name="_csrf"')
    assert.include(read('admin/users.edge'), '/admin/users/{{ user.id }}/roles')
    assert.include(read('admin/dashboard.edge'), 'name="_csrf"')
  })

  test('audit.edge degrada quando consulta não suportada', ({ assert }) => {
    assert.include(read('admin/audit.edge'), '@if(!supported)')
  })
})
