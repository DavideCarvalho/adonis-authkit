import { test } from '@japa/runner'
import {
  DEFAULT_MESSAGES,
  resolveMessages,
  translate,
  type AuthMessages,
} from '../../src/host/i18n.js'

test.group('i18n', () => {
  test('resolveMessages() sem config retorna os defaults pt-BR', ({ assert }) => {
    const messages = resolveMessages()
    assert.deepEqual(messages, { ...DEFAULT_MESSAGES })
    assert.equal(messages['login.title'], 'Entrar')
    assert.equal(messages['account.tokens.create'], 'Criar')
  })

  test('override de uma única chave mantém o resto em pt-BR', ({ assert }) => {
    const messages = resolveMessages({
      messages: { 'pt-BR': { 'login.title': 'Acessar' } },
    })
    assert.equal(messages['login.title'], 'Acessar')
    // O restante segue o default.
    assert.equal(messages['login.submit'], 'Entrar')
    assert.equal(messages['signup.title'], 'Criar conta')
  })

  test('locale novo (en) + locale:"en" usa o en, caindo no pt-BR para chaves omitidas', ({
    assert,
  }) => {
    const en: Partial<AuthMessages> = {
      'login.title': 'Sign in',
      'login.submit': 'Sign in',
      'signup.title': 'Create account',
    }
    const messages = resolveMessages({ locale: 'en', messages: { en } })
    assert.equal(messages['login.title'], 'Sign in')
    assert.equal(messages['signup.title'], 'Create account')
    // Chave não traduzida no en cai no default pt-BR.
    assert.equal(messages['forgot.title'], 'Recuperar senha')
  })

  test('locale inexistente cai inteiramente no default pt-BR', ({ assert }) => {
    const messages = resolveMessages({ locale: 'fr' })
    assert.deepEqual(messages, { ...DEFAULT_MESSAGES })
  })

  test('translate interpola {name} e cai na key quando ausente', ({ assert }) => {
    const messages = resolveMessages()
    assert.equal(translate(messages, 'login.greeting', { name: 'Ana' }), 'Olá, Ana')
    // Sem params, o template é retornado como está (placeholder intacto).
    assert.equal(translate(messages, 'login.greeting'), 'Olá, {name}')
    // Chave ausente cai na própria key.
    assert.equal(translate(messages, 'nope.missing'), 'nope.missing')
    // Interpola números também.
    assert.equal(
      translate({ 'x.count': 'Total: {n}' }, 'x.count', { n: 3 }),
      'Total: 3'
    )
    // Placeholder sem valor permanece intacto.
    assert.equal(
      translate({ 'x.msg': 'Oi {a} e {b}' }, 'x.msg', { a: 'X' }),
      'Oi X e {b}'
    )
  })
})
