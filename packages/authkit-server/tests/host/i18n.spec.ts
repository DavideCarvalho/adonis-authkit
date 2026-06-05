import { test } from '@japa/runner'
import {
  DEFAULT_MESSAGES,
  PT_BR_MESSAGES,
  resolveMessages,
  translate,
  type AuthMessages,
} from '../../src/host/i18n.js'

test.group('i18n', () => {
  test('resolveMessages() sem config retorna os defaults em inglês', ({ assert }) => {
    const messages = resolveMessages()
    assert.deepEqual(messages, { ...DEFAULT_MESSAGES })
    assert.equal(messages['login.title'], 'Login')
    assert.equal(messages['account.tokens.create'], 'Create')
  })

  test('locale embutido pt-BR funciona sem nenhuma mensagem customizada', ({ assert }) => {
    const messages = resolveMessages({ locale: 'pt-BR' })
    assert.equal(messages['login.title'], 'Entrar')
    assert.equal(messages['account.tokens.create'], 'Criar')
    assert.equal(messages['signup.title'], 'Criar conta')
    // Cobertura total: o pt-BR embutido espelha todas as chaves do default.
    assert.deepEqual(messages, { ...PT_BR_MESSAGES })
  })

  test('override de uma única chave (en) mantém o resto em inglês', ({ assert }) => {
    const messages = resolveMessages({
      messages: { en: { 'login.title': 'Sign in' } },
    })
    assert.equal(messages['login.title'], 'Sign in')
    // O restante segue o default em inglês.
    assert.equal(messages['login.submit'], 'Log in')
    assert.equal(messages['signup.title'], 'Create account')
  })

  test('override de uma única chave sobre o pt-BR embutido mantém o resto em pt-BR', ({
    assert,
  }) => {
    const messages = resolveMessages({
      locale: 'pt-BR',
      messages: { 'pt-BR': { 'login.title': 'Acessar' } },
    })
    assert.equal(messages['login.title'], 'Acessar')
    // O restante segue o pt-BR embutido.
    assert.equal(messages['login.submit'], 'Entrar')
    assert.equal(messages['signup.title'], 'Criar conta')
  })

  test('locale novo (fr) + locale:"fr" usa o fr, caindo no en para chaves omitidas', ({
    assert,
  }) => {
    const fr: Partial<AuthMessages> = {
      'login.title': 'Connexion',
      'login.submit': 'Se connecter',
      'signup.title': 'Créer un compte',
    }
    const messages = resolveMessages({ locale: 'fr', messages: { fr } })
    assert.equal(messages['login.title'], 'Connexion')
    assert.equal(messages['signup.title'], 'Créer un compte')
    // Chave não traduzida no fr cai no default en.
    assert.equal(messages['forgot.title'], 'Reset password')
  })

  test('locale inexistente cai inteiramente no default en', ({ assert }) => {
    const messages = resolveMessages({ locale: 'xx' })
    assert.deepEqual(messages, { ...DEFAULT_MESSAGES })
  })

  test('translate interpola {name} e cai na key quando ausente', ({ assert }) => {
    const messages = resolveMessages()
    assert.equal(translate(messages, 'login.greeting', { name: 'Ana' }), 'Hi, Ana')
    // Sem params, o template é retornado como está (placeholder intacto).
    assert.equal(translate(messages, 'login.greeting'), 'Hi, {name}')
    // Chave ausente cai na própria key.
    assert.equal(translate(messages, 'nope.missing'), 'nope.missing')
    // Interpola números também.
    assert.equal(translate({ 'x.count': 'Total: {n}' }, 'x.count', { n: 3 }), 'Total: 3')
    // Placeholder sem valor permanece intacto.
    assert.equal(
      translate({ 'x.msg': 'Hi {a} and {b}' }, 'x.msg', { a: 'X' }),
      'Hi X and {b}'
    )
  })
})
