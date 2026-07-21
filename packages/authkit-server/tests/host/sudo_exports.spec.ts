/**
 * Superfície pública do SPI de sudo.
 *
 * O que este arquivo protege é a PROMESSA do SPI: um host consegue montar sua
 * própria lista de métodos sem alcançar caminhos internos do pacote.
 */

import { test } from '@japa/runner'
import { sudoMethods, completeSudo } from '../../index.js'

test.group('superfície pública do SPI de sudo', () => {
  test('exporta os quatro métodos embutidos', ({ assert }) => {
    assert.isFunction(sudoMethods.password)
    assert.isFunction(sudoMethods.passkey)
    assert.isFunction(sudoMethods.oidcStepUp)
    assert.isFunction(sudoMethods.magicLink)
  })

  test('exporta completeSudo — o host precisa dele para o oidcStepUp', ({ assert }) => {
    assert.isFunction(completeSudo)
  })

  test('os ids são estáveis (vão no audit e na preferência)', ({ assert }) => {
    assert.equal(sudoMethods.password().id, 'password')
    assert.equal(sudoMethods.passkey().id, 'passkey')
    assert.equal(sudoMethods.oidcStepUp({ url: '/x' }).id, 'oidc-step-up')
    assert.equal(sudoMethods.magicLink().id, 'magic-link')
  })
})
