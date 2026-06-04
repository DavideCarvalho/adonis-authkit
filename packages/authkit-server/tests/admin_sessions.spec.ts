import { test } from '@japa/runner'
import { createServer, type Server } from 'node:http'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { OidcService } from '../src/provider/oidc_service.js'
import { AdminSessionsService } from '../src/host/admin_sessions_service.js'
import { DatabaseAdapter } from '../src/adapters/database_adapter.js'
import { createTestDatabase, fakeAccountStore } from './bootstrap.js'

/** Cria a tabela única usada pelo DatabaseAdapter (mesmo schema da migration do host). */
async function migrate(db: any) {
  await db.connection().schema.createTable('authkit_oidc_payloads', (t: any) => {
    t.string('id').notNullable()
    t.string('model_name').notNullable()
    t.text('payload').notNullable()
    t.string('grant_id').nullable()
    t.string('user_code').nullable()
    t.string('uid').nullable()
    t.timestamp('expires_at').nullable()
    t.primary(['model_name', 'id'])
  })
}

async function startService(port: number, db: any) {
  const issuer = `http://localhost:${port}`
  const fakeApp = { container: { make: async () => db } } as any
  const cfg = await configProvider.resolve(
    fakeApp,
    defineConfig({
      issuer,
      adapter: adapters.database({}),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients: [
        {
          clientId: 'c1',
          clientSecret: 's',
          redirectUris: [`${issuer}/cb`],
          grants: ['authorization_code', 'refresh_token'],
        },
      ],
      accountStore: fakeAccountStore(),
    })
  )
  const service = new OidcService(cfg!, 'a'.repeat(32))
  const server: Server = createServer(service.callback)
  await new Promise<void>((r) => server.listen(port, r))
  return { issuer, service, server }
}

/**
 * Persiste artefatos OIDC (Session/Grant/AccessToken/RefreshToken) como o provider
 * faria. Os ids são prefixados pelo accountId — a PK do adapter é `(model, id)`,
 * então ids distintos por conta evitam que uma sobrescreva a outra.
 */
async function seedArtifacts(db: any, accountId: string, grantId: string) {
  const session = new DatabaseAdapter('Session', db)
  const grant = new DatabaseAdapter('Grant', db)
  const at = new DatabaseAdapter('AccessToken', db)
  const rt = new DatabaseAdapter('RefreshToken', db)
  const p = accountId

  await session.upsert(`sess-${p}`, { accountId, loginTs: 1700000000, amr: ['pwd'] } as any, 3600)
  await grant.upsert(grantId, { accountId, clientId: 'c1' } as any, 3600)
  await at.upsert(`at1-${p}`, { accountId, clientId: 'c1', grantId } as any, 3600)
  await at.upsert(`at2-${p}`, { accountId, clientId: 'c1', grantId } as any, 3600)
  await rt.upsert(`rt1-${p}`, { accountId, clientId: 'c1', grantId } as any, 3600)
}

test.group('AdminSessionsService (sessões/grants + revogação adapter-backed)', (group) => {
  let db: any
  group.each.setup(async () => {
    db = createTestDatabase()
    await migrate(db)
    return async () => db.manager.closeAll()
  })

  test('enumera sessões e grants criados por um fluxo, com contagem de tokens', async ({
    assert,
    cleanup,
  }) => {
    const port = 9851
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    await seedArtifacts(db, 'acc-1', 'grant-1')
    // Artefatos de OUTRA conta não devem aparecer.
    await seedArtifacts(db, 'acc-2', 'grant-2')

    const admin = new AdminSessionsService(service)
    assert.isTrue(admin.canList)

    const sessions = await admin.listSessions('acc-1')
    assert.lengthOf(sessions, 1)
    assert.equal(sessions[0].id, 'sess-acc-1')
    assert.equal(sessions[0].loginTs, 1700000000)

    const grants = await admin.listGrants('acc-1')
    assert.lengthOf(grants, 1)
    assert.equal(grants[0].id, 'grant-1')
    assert.equal(grants[0].clientId, 'c1')
    assert.equal(grants[0].accessTokens, 2)
    assert.equal(grants[0].refreshTokens, 1)
  })

  test('revokeAll destrói sessões + grants (provider não acha mais) + tokens', async ({
    assert,
    cleanup,
  }) => {
    const port = 9852
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    await seedArtifacts(db, 'acc-1', 'grant-1')
    await seedArtifacts(db, 'acc-2', 'grant-2')

    const admin = new AdminSessionsService(service)
    const result = await admin.revokeAll('acc-1')
    assert.deepEqual(result, { sessions: 1, grants: 1, accessTokens: 2, refreshTokens: 1 })

    // O provider não acha mais a session nem o grant da conta revogada.
    assert.isUndefined(await (service.provider as any).Session.find('sess-acc-1'))
    assert.isUndefined(await (service.provider as any).Grant.find('grant-1'))
    // Tokens destruídos (belt-and-braces).
    assert.isUndefined(await new DatabaseAdapter('AccessToken', db).find('at1-acc-1'))
    assert.isUndefined(await new DatabaseAdapter('RefreshToken', db).find('rt1-acc-1'))

    // A conta NÃO revogada permanece intacta.
    assert.isOk(await (service.provider as any).Grant.find('grant-2'))
    assert.lengthOf(await admin.listSessions('acc-2'), 1)
  })

  test('canList=false e listas vazias quando o adapter não enumera', async ({ assert }) => {
    // Adapter sem `list`: o serviço degrada graciosamente.
    class NoListAdapter {
      async find() {
        return undefined
      }
      async upsert() {}
      async destroy() {}
      async consume() {}
      async findByUid() {
        return undefined
      }
      async findByUserCode() {
        return undefined
      }
      async revokeByGrantId() {}
    }
    const fakeService = { config: { AdapterClass: NoListAdapter } } as any
    const admin = new AdminSessionsService(fakeService)
    assert.isFalse(admin.canList)
    assert.lengthOf(await admin.listSessions('acc-1'), 0)
    assert.lengthOf(await admin.listGrants('acc-1'), 0)
    const result = await admin.revokeAll('acc-1')
    assert.deepEqual(result, { sessions: 0, grants: 0, accessTokens: 0, refreshTokens: 0 })
  })
})
