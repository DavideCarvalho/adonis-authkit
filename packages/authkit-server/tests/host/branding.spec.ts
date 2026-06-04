import { test } from '@japa/runner'
import { brandFor, isFirstParty, type BrandingConfig } from '../../src/host/branding.js'

const cfg: BrandingConfig = {
  company: 'educ(a)ção',
  clients: {
    'entre-textos': { appName: 'Entre Textos', accent: '#1d4ed8', accentSoft: '#3b82f6', tagline: 'Orientação' },
  },
  default: { appName: 'Sua conta', accent: '#111827', accentSoft: '#374151', tagline: 'Acesso' },
  firstParty: ['entre-textos'],
  audienceLabels: { advisor: 'Orientador' },
}

test.group('branding', () => {
  test('brandFor retorna a marca do client + company', ({ assert }) => {
    const b = brandFor(cfg, 'entre-textos')
    assert.equal(b.appName, 'Entre Textos')
    assert.equal(b.company, 'educ(a)ção')
  })
  test('brandFor cai no default p/ client desconhecido', ({ assert }) => {
    assert.equal(brandFor(cfg, 'xpto').appName, 'Sua conta')
  })
  test('brandFor anexa audienceLabel quando há audience', ({ assert }) => {
    assert.equal(brandFor(cfg, 'entre-textos', 'advisor').audienceLabel, 'Orientador')
    assert.isUndefined(brandFor(cfg, 'entre-textos', 'nope').audienceLabel)
  })
  test('isFirstParty', ({ assert }) => {
    assert.isTrue(isFirstParty(cfg, 'entre-textos'))
    assert.isFalse(isFirstParty(cfg, 'xpto'))
    assert.isFalse(isFirstParty(cfg, undefined))
  })
})
