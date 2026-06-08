import { test } from '@japa/runner'
import { makeSingleFlightLock } from '../../src/provider/single_flight_lock.js'

test.group('makeSingleFlightLock', () => {
  test('sem @adonisjs/lock → roda fn (single-instance, no-lock)', async ({ assert }) => {
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => null })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 1)
  })

  test('com lock adquirido → roda fn e libera', async ({ assert }) => {
    let released = false
    const fakeLock = { acquireImmediately: async () => true, release: async () => { released = true } }
    const fakeService = { use: () => ({ createLock: () => fakeLock }) }
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => fakeService as any })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 1)
    assert.isTrue(released)
  })

  test('lock NÃO adquirido → não roda fn (outra instância já rotaciona)', async ({ assert }) => {
    const fakeLock = { acquireImmediately: async () => false, release: async () => {} }
    const fakeService = { use: () => ({ createLock: () => fakeLock }) }
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => fakeService as any })
    let ran = 0
    await withLock(async () => { ran++ })
    assert.equal(ran, 0)
  })

  test('libera o lock mesmo se fn lança', async ({ assert }) => {
    let released = false
    const fakeLock = { acquireImmediately: async () => true, release: async () => { released = true } }
    const fakeService = { use: () => ({ createLock: () => fakeLock }) }
    const withLock = makeSingleFlightLock({ key: 'k', ttlMs: 1000, loadLock: async () => fakeService as any })
    await assert.rejects(() => withLock(async () => { throw new Error('boom') }))
    assert.isTrue(released) // finally liberou
  })
})
