import { test } from '@japa/runner'
import { createServer, type Server } from 'node:http'
import { configProvider } from '@adonisjs/core'
import { defineConfig, adapters } from '../src/define_config.js'
import { OidcService } from '../src/provider/oidc_service.js'
import { AdminClientsService } from '../src/host/admin_clients_service.js'
import { importClients } from '../src/commands/import_clients.js'
import { createTestDatabase, fakeAccountStore } from './bootstrap.js'
import type { ClientConfig } from '@dudousxd/adonis-authkit-core'

/** Cria a tabela OIDC no SQLite em memória. */
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

/** Sobe um OidcService com SQLite em memória. */
async function startService(port: number, db: any, clients: ClientConfig[] = []) {
  const issuer = `http://localhost:${port}`
  const fakeApp = { container: { make: async () => db } } as any
  const cfg = await configProvider.resolve(
    fakeApp,
    defineConfig({
      issuer,
      adapter: adapters.database({}),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients,
      accountStore: fakeAccountStore(),
    })
  )
  const service = new OidcService(cfg!, 'a'.repeat(32))
  const server: Server = createServer(service.callback)
  await new Promise<void>((r) => server.listen(port, r))
  return { issuer, service, server }
}

test.group('importClients (lógica pura)', (group) => {
  let db: any
  group.each.setup(async () => {
    db = createTestDatabase()
    await migrate(db)
    return async () => db.manager.closeAll()
  })

  test('cria um client que não existe no adapter, preservando o secret', async ({
    assert,
    cleanup,
  }) => {
    const port = 9920
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    const clients: ClientConfig[] = [
      {
        clientId: 'my-app',
        clientSecret: 'original-secret',
        redirectUris: ['https://app/cb'],
        grants: ['authorization_code', 'refresh_token'],
      },
    ]

    const report = await importClients(clients, svc)

    assert.equal(report.created, 1)
    assert.equal(report.skipped, 0)
    assert.equal(report.errors, 0)
    assert.equal(report.entries[0].outcome, 'created')
    // O secret original deve ser preservado (não gerado aleatoriamente).
    assert.equal(report.entries[0].clientSecret, 'original-secret')

    // Verifica que o provider encontra o client com o secret original.
    const found = await (service.provider as any).Client.find('my-app')
    assert.isOk(found)
    assert.equal(found.metadata().client_secret, 'original-secret')
  })

  test('pula um client já existente no adapter (idempotente)', async ({
    assert,
    cleanup,
  }) => {
    const port = 9921
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    // Cria o client primeiro.
    await svc.create({
      clientId: 'existing-app',
      redirectUris: ['https://app/cb'],
      postLogoutRedirectUris: [],
      grantTypes: ['authorization_code'],
      tokenEndpointAuthMethod: 'client_secret_basic',
    })

    const clients: ClientConfig[] = [
      {
        clientId: 'existing-app',
        clientSecret: 'should-not-overwrite',
        redirectUris: ['https://app/cb-new'],
        grants: ['authorization_code'],
      },
    ]

    const report = await importClients(clients, svc)

    assert.equal(report.created, 0)
    assert.equal(report.skipped, 1)
    assert.equal(report.errors, 0)
    assert.equal(report.entries[0].outcome, 'skipped')
    assert.equal(report.entries[0].reason, 'already exists')

    // Confirma que o redirect_uri original NÃO foi sobrescrito.
    const found = await svc.find('existing-app')
    assert.deepEqual(found!.redirectUris, ['https://app/cb'])
  })

  test('dry-run conta criações sem persistir', async ({ assert, cleanup }) => {
    const port = 9922
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    const clients: ClientConfig[] = [
      {
        clientId: 'dry-app',
        clientSecret: 'secret',
        redirectUris: ['https://app/cb'],
        grants: ['authorization_code'],
      },
    ]

    const report = await importClients(clients, svc, { dryRun: true })

    assert.equal(report.created, 1)
    assert.equal(report.skipped, 0)
    assert.equal(report.errors, 0)
    assert.equal(report.entries[0].outcome, 'created')

    // Dry-run: o client NÃO deve estar no adapter.
    const found = await svc.find('dry-app')
    assert.isUndefined(found, 'dry-run não deve persistir nada')
  })

  test('relatorio misto: cria novos, pula existentes', async ({ assert, cleanup }) => {
    const port = 9923
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    // Cria um client pré-existente.
    await svc.create({
      clientId: 'preexisting',
      redirectUris: ['https://preexisting/cb'],
      postLogoutRedirectUris: [],
      grantTypes: ['authorization_code'],
      tokenEndpointAuthMethod: 'client_secret_basic',
    })

    const clients: ClientConfig[] = [
      { clientId: 'preexisting', clientSecret: 's', redirectUris: ['https://preexisting/cb'], grants: ['authorization_code'] },
      { clientId: 'brand-new', clientSecret: 'new-secret', redirectUris: ['https://new/cb'], grants: ['authorization_code'] },
    ]

    const report = await importClients(clients, svc)

    assert.equal(report.created, 1)
    assert.equal(report.skipped, 1)
    assert.equal(report.errors, 0)
    const createdEntry = report.entries.find((e) => e.clientId === 'brand-new')!
    assert.equal(createdEntry.outcome, 'created')
    assert.equal(createdEntry.clientSecret, 'new-secret')
  })

  test('client público (sem secret) não recebe clientSecret na saída', async ({
    assert,
    cleanup,
  }) => {
    const port = 9924
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    const clients: ClientConfig[] = [
      {
        clientId: 'spa-app',
        redirectUris: ['https://spa/cb'],
        grants: ['authorization_code'],
        tokenEndpointAuthMethod: 'none',
      },
    ]

    const report = await importClients(clients, svc)

    assert.equal(report.created, 1)
    assert.isUndefined(report.entries[0].clientSecret)
    const found = await svc.find('spa-app')
    assert.isFalse(found!.confidential)
  })

  test('preserva backchannel_logout_uri ao importar', async ({ assert, cleanup }) => {
    const port = 9925
    const { service, server } = await startService(port, db)
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    const clients: ClientConfig[] = [
      {
        clientId: 'bc-app',
        clientSecret: 'secret',
        redirectUris: ['https://bc-app/cb'],
        grants: ['authorization_code'],
        backchannelLogoutUri: 'https://bc-app/backchannel',
        backchannelLogoutSessionRequired: true,
      },
    ]

    const report = await importClients(clients, svc)

    assert.equal(report.created, 1)
    const found = await svc.find('bc-app')
    assert.equal(found!.backchannelLogoutUri, 'https://bc-app/backchannel')
    assert.isTrue(found!.backchannelLogoutSessionRequired)
  })
})

test.group('boot sem clients estáticos', (group) => {
  let db: any
  group.each.setup(async () => {
    db = createTestDatabase()
    await migrate(db)
    return async () => db.manager.closeAll()
  })

  test('servidor sobe normalmente sem nenhum client no config (clients omitido)', async ({
    assert,
    cleanup,
  }) => {
    const port = 9930
    // clients omitido — padrão agora é array vazio.
    const issuer = `http://localhost:${port}`
    const fakeApp = { container: { make: async () => db } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer,
        adapter: adapters.database({}),
        jwks: { source: 'managed', algorithm: 'RS256' },
        // clients NÃO passado
        accountStore: fakeAccountStore(),
      })
    )

    assert.isOk(cfg, 'config deve resolver mesmo sem clients')
    assert.deepEqual(cfg!.clients, [], 'clients deve ser array vazio quando omitido')

    // Sobe o serviço — não deve lançar.
    const service = new OidcService(cfg!, 'a'.repeat(32))
    const server: Server = createServer(service.callback)
    await new Promise<void>((r) => server.listen(port, r))
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    assert.isOk(service.provider)
    assert.equal(service.provider.issuer, issuer)
  })

  test('servidor sobe normalmente com clients: [] explícito', async ({ assert, cleanup }) => {
    const port = 9931
    const issuer = `http://localhost:${port}`
    const fakeApp = { container: { make: async () => db } } as any
    const cfg = await configProvider.resolve(
      fakeApp,
      defineConfig({
        issuer,
        adapter: adapters.database({}),
        jwks: { source: 'managed', algorithm: 'RS256' },
        clients: [],
        accountStore: fakeAccountStore(),
      })
    )

    assert.deepEqual(cfg!.clients, [])
    const service = new OidcService(cfg!, 'a'.repeat(32))
    const server: Server = createServer(service.callback)
    await new Promise<void>((r) => server.listen(port, r))
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    // Discovery deve funcionar.
    const res = await fetch(`${issuer}/.well-known/openid-configuration`)
    assert.equal(res.status, 200)
    const body: any = await res.json()
    assert.equal(body.issuer, issuer)
  })

  test('client criado via AdminClientsService após boot sem clients estáticos é localizável pelo provider', async ({
    assert,
    cleanup,
  }) => {
    const port = 9932
    const { service, server } = await startService(port, db, [])
    cleanup(() => new Promise<void>((r) => server.close(() => r())))

    const svc = new AdminClientsService(service)
    const created = await svc.create({
      redirectUris: [`http://localhost:${port}/cb`],
      postLogoutRedirectUris: [],
      grantTypes: ['authorization_code', 'refresh_token'],
      tokenEndpointAuthMethod: 'client_secret_basic',
    })

    assert.isString(created.clientId)
    const found = await (service.provider as any).Client.find(created.clientId)
    assert.isOk(found, 'client criado via console deve ser localizável pelo provider sem clients estáticos')
  })
})
