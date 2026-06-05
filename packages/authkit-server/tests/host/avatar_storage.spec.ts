import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Edge } from 'edge.js'
import {
  storeAvatar,
  isDriveAvailable,
  AvatarUploadError,
  __setDriveLoaderForTests,
} from '../../src/host/avatar_storage.js'
import { resolveUploads } from '../../src/define_config.js'
import { DEFAULT_MESSAGES, translate } from '../../src/host/i18n.js'

const viewsDir = fileURLToPath(new URL('../../src/host/views/', import.meta.url))
const readView = (p: string) => readFileSync(viewsDir + p, 'utf8')

function makeEdge() {
  const edge = new Edge()
  edge.mount('authkit', viewsDir)
  edge.global('t', (key: string, params?: Record<string, string | number>) =>
    translate({ ...DEFAULT_MESSAGES }, key, params)
  )
  return edge
}

/** Drive fake em memória: registra puts e devolve URL previsível. */
function fakeDrive() {
  const puts: { key: string }[] = []
  const disk = {
    async putStream(key: string) {
      puts.push({ key })
    },
    async getUrl(key: string) {
      return `https://cdn.test/${key}`
    },
  }
  return {
    puts,
    service: {
      use(_disk?: string) {
        return disk
      },
    },
  }
}

/** File de multipart fake (com moveToDisk + tmpPath). */
function fakeFile(over: Partial<{ extname: string; size: number; recorded: string[] }> = {}) {
  const moves: string[] = over.recorded ?? []
  return {
    extname: over.extname ?? 'png',
    size: over.size ?? 1024,
    tmpPath: '/tmp/fake-avatar.png',
    async moveToDisk(key: string) {
      moves.push(key)
    },
    moves,
  }
}

const ctx = {} as any
const msgs = {
  extname: translate({ ...DEFAULT_MESSAGES }, 'account.profile.avatar_invalid_type'),
  size: translate({ ...DEFAULT_MESSAGES }, 'account.profile.avatar_too_large'),
}

test.group('avatar_storage', (group) => {
  group.each.teardown(() => {
    __setDriveLoaderForTests(undefined)
  })

  test('armazena avatar via drive do app e retorna URL pública', async ({ assert }) => {
    const drive = fakeDrive()
    __setDriveLoaderForTests(() => Promise.resolve(drive.service))

    const cfg = resolveUploads()
    const file = fakeFile()
    const url = await storeAvatar(ctx, cfg, file as any, 'acc-1', msgs)

    assert.isString(url)
    assert.include(url!, 'https://cdn.test/authkit/avatars/acc-1-')
    assert.match(url!, /\.png$/)
    // moveToDisk foi usado com a key derivada.
    assert.lengthOf(file.moves, 1)
    assert.include(file.moves[0], 'authkit/avatars/acc-1-')
  })

  test('respeita disk e directory customizados', async ({ assert }) => {
    let usedDisk: string | undefined
    const inner = {
      async getUrl(key: string) {
        return `https://s3/${key}`
      },
    }
    __setDriveLoaderForTests(() =>
      Promise.resolve({
        use(d?: string) {
          usedDisk = d
          return inner
        },
      })
    )

    const cfg = resolveUploads({ avatars: { disk: 's3', directory: 'custom/dir' } })
    const file = fakeFile()
    const url = await storeAvatar(ctx, cfg, file as any, 'acc-9', msgs)

    assert.equal(usedDisk, 's3')
    assert.include(url!, 'https://s3/custom/dir/acc-9-')
    assert.include(file.moves[0], 'custom/dir/acc-9-')
  })

  test('rejeita extensão inválida com erro i18n', async ({ assert }) => {
    __setDriveLoaderForTests(() => Promise.resolve(fakeDrive().service))
    const cfg = resolveUploads()
    const file = fakeFile({ extname: 'gif' })

    await assert.rejects(async () => {
      await storeAvatar(ctx, cfg, file as any, 'acc-1', msgs)
    }, msgs.extname)

    try {
      await storeAvatar(ctx, cfg, file as any, 'acc-1', msgs)
    } catch (e: any) {
      assert.instanceOf(e, AvatarUploadError)
      assert.equal(e.reason, 'extname')
    }
  })

  test('rejeita arquivo acima do tamanho máximo com erro i18n', async ({ assert }) => {
    __setDriveLoaderForTests(() => Promise.resolve(fakeDrive().service))
    const cfg = resolveUploads({ avatars: { maxSizeMb: 1 } })
    const file = fakeFile({ size: 2 * 1024 * 1024 })

    try {
      await storeAvatar(ctx, cfg, file as any, 'acc-1', msgs)
      assert.fail('deveria ter lançado')
    } catch (e: any) {
      assert.instanceOf(e, AvatarUploadError)
      assert.equal(e.reason, 'size')
      assert.equal(e.message, msgs.size)
    }
  })

  test('drive ausente → retorna null (degrada para URL) e isDriveAvailable=false', async ({
    assert,
  }) => {
    __setDriveLoaderForTests(() => Promise.resolve(null))
    const cfg = resolveUploads()
    const file = fakeFile()

    const url = await storeAvatar(ctx, cfg, file as any, 'acc-1', msgs)
    assert.isNull(url)
    assert.isFalse(await isDriveAvailable())
  })

  test('view mostra input de arquivo quando avatarUploadSupported', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.renderRaw(readView('account/security.edge'), {
      csrfToken: 'x',
      supported: true,
      profileSupported: true,
      avatarUploadSupported: true,
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: 'https://cdn.test/a.png',
    })
    assert.include(html, 'name="avatar" type="file"')
    assert.include(html, 'enctype="multipart/form-data"')
    assert.include(html, translate({ ...DEFAULT_MESSAGES }, 'account.profile.avatar_upload_label'))
    // thumbnail do avatar atual.
    assert.include(html, 'https://cdn.test/a.png')
  })

  test('view esconde input de arquivo quando drive ausente', async ({ assert }) => {
    const edge = makeEdge()
    const html = await edge.renderRaw(readView('account/security.edge'), {
      csrfToken: 'x',
      supported: true,
      profileSupported: true,
      avatarUploadSupported: false,
      email: 'a@b.com',
      name: 'Ana',
      avatarUrl: '',
    })
    assert.notInclude(html, 'name="avatar" type="file"')
    // input de URL continua disponível (path de degradação).
    assert.include(html, 'name="avatarUrl"')
  })
})
