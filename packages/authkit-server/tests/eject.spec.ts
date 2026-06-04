import { test } from '@japa/runner'

test.group('authkit:eject command', () => {
  test('commandName é authkit:eject', async ({ assert }) => {
    const { default: AuthkitEject } = await import('../commands/eject.js')
    assert.equal(AuthkitEject.commandName, 'authkit:eject')
  })

  test('description está preenchida', async ({ assert }) => {
    const { default: AuthkitEject } = await import('../commands/eject.js')
    assert.isString(AuthkitEject.description)
    assert.isAbove(AuthkitEject.description.length, 0)
  })

  test('tem flag --views (boolean) registrada nos metadados estáticos', async ({ assert }) => {
    const { default: AuthkitEject } = await import('../commands/eject.js')
    // @flags.boolean armazena metadados em AuthkitEject.flags (static array do @adonisjs/ace)
    const viewsFlag = (AuthkitEject as any).flags?.find((f: any) => f.name === 'views')
    assert.exists(viewsFlag, 'flag "views" deve estar em AuthkitEject.flags')
    assert.equal(viewsFlag.type, 'boolean')
  })

  test('tem flag --controller (string) registrada nos metadados estáticos', async ({ assert }) => {
    const { default: AuthkitEject } = await import('../commands/eject.js')
    const controllerFlag = (AuthkitEject as any).flags?.find((f: any) => f.name === 'controller')
    assert.exists(controllerFlag, 'flag "controller" deve estar em AuthkitEject.flags')
    assert.equal(controllerFlag.type, 'string')
  })

  test('commands.json contém entrada para authkit:eject', async ({ assert }) => {
    const { readFileSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')

    const dir = dirname(fileURLToPath(import.meta.url))
    const jsonPath = join(dir, '../commands/commands.json')
    const meta = JSON.parse(readFileSync(jsonPath, 'utf-8'))

    const entry = meta.commands.find((c: any) => c.commandName === 'authkit:eject')
    assert.exists(entry, 'commands.json deve ter entrada para authkit:eject')
    assert.equal(entry.filePath, 'eject.js')

    const viewsFlag = entry.flags.find((f: any) => f.name === 'views')
    assert.exists(viewsFlag, 'entry deve ter flag views')
    assert.equal(viewsFlag.type, 'boolean')

    const controllerFlag = entry.flags.find((f: any) => f.name === 'controller')
    assert.exists(controllerFlag, 'entry deve ter flag controller')
    assert.equal(controllerFlag.type, 'string')
  })

  test('getMetaData retorna entry do eject', async ({ assert }) => {
    const { getMetaData } = await import('../commands/main.js')
    const meta = await getMetaData()
    const entry = meta.find((c: any) => c.commandName === 'authkit:eject')
    assert.exists(entry)
  })
})
