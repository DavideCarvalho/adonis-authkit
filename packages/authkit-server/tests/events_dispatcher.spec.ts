import { test } from '@japa/runner'
import { createServer, type Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { configProvider } from '@adonisjs/core'
import RedisMock from 'ioredis-mock'
import { defineConfig, adapters } from '../src/define_config.js'
import {
  composeAuditSink,
  resolveEvents,
  buildWebhookBody,
  signWebhookBody,
} from '../src/events/dispatcher.js'
import type { AuditEvent, AuditSink } from '../src/audit/audit_sink.js'
import { fakeAccountStore } from './bootstrap.js'

const fakeApp = () =>
  ({
    container: { make: async () => ({ connection: () => new RedisMock() }) },
  }) as any

test.group('events/dispatcher — composeAuditSink', () => {
  test('onEvent recebe os eventos record-ados', async ({ assert }) => {
    const received: AuditEvent[] = []
    const sink = composeAuditSink(undefined, { onEvent: (e) => void received.push(e) })

    await sink.record({ type: 'login.success', accountId: 'acc-1', email: 'a@b.c' })
    await sink.record({ type: 'login.failure', email: 'x@y.z' })

    assert.lengthOf(received, 2)
    assert.equal(received[0].type, 'login.success')
    assert.equal(received[1].type, 'login.failure')
  })

  test('delega record ao sink original E ao onEvent', async ({ assert }) => {
    const persisted: AuditEvent[] = []
    const original: AuditSink = { async record(e) { persisted.push(e) } }
    const observed: AuditEvent[] = []
    const sink = composeAuditSink(original, { onEvent: (e) => void observed.push(e) })

    await sink.record({ type: 'signup', email: 'new@user.com' })

    assert.lengthOf(persisted, 1)
    assert.lengthOf(observed, 1)
  })

  test('falha no sink original NÃO quebra o record nem impede onEvent', async ({ assert }) => {
    const broken: AuditSink = {
      async record() {
        throw new Error('db down')
      },
    }
    const observed: AuditEvent[] = []
    const sink = composeAuditSink(broken, { onEvent: (e) => void observed.push(e) })

    // não deve lançar
    await sink.record({ type: 'login.success', email: 'a@b.c' })
    assert.lengthOf(observed, 1)
  })

  test('falha no onEvent NÃO quebra o record (best-effort)', async ({ assert }) => {
    const persisted: AuditEvent[] = []
    const original: AuditSink = { async record(e) { persisted.push(e) } }
    const sink = composeAuditSink(original, {
      onEvent: () => {
        throw new Error('handler boom')
      },
    })

    await sink.record({ type: 'mfa.enabled', accountId: 'acc-9' })
    assert.lengthOf(persisted, 1)
  })

  test('preserva list() do sink original (consulta admin)', async ({ assert }) => {
    const original: AuditSink = {
      async record() {},
      async list() {
        return { data: [], total: 0 }
      },
    }
    const sink = composeAuditSink(original, { onEvent: () => {} })
    assert.isFunction(sink.list)
    const page = await sink.list!({ page: 1, limit: 10 })
    assert.equal(page.total, 0)
  })

  test('webhook POST é capturado por servidor in-process com HMAC válido', async ({
    assert,
  }) => {
    const secret = 's3cr3t'
    const captured: { body: string; sig: string | undefined }[] = []
    const server: Server = createServer((req, res) => {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        captured.push({ body, sig: req.headers['x-authkit-signature'] as string })
        res.writeHead(200)
        res.end('ok')
      })
    })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as any).port
    const url = `http://127.0.0.1:${port}/hook`

    const sink = composeAuditSink(undefined, { webhook: { url, secret } })
    await sink.record({
      type: 'login.success',
      accountId: 'acc-1',
      email: 'a@b.c',
      clientId: 'app1',
      ip: '1.2.3.4',
      metadata: { foo: 'bar' },
    })

    // webhook é fire-and-forget: espera a entrega
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 3000
      const tick = () => {
        if (captured.length > 0) return resolve()
        if (Date.now() > deadline) return reject(new Error('webhook não chegou'))
        setTimeout(tick, 20)
      }
      tick()
    })

    await new Promise<void>((r) => server.close(() => r()))

    assert.lengthOf(captured, 1)
    const { body, sig } = captured[0]
    const parsed = JSON.parse(body)
    assert.equal(parsed.type, 'login.success')
    assert.equal(parsed.accountId, 'acc-1')
    assert.equal(parsed.clientId, 'app1')
    assert.equal(parsed.ip, '1.2.3.4')
    assert.deepEqual(parsed.metadata, { foo: 'bar' })
    assert.isString(parsed.ts)

    // HMAC válido
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
    assert.equal(sig, expected)
  })

  test('webhook sem secret não envia header de assinatura', async ({ assert }) => {
    const captured: (string | undefined)[] = []
    const server = createServer((req, res) => {
      captured.push(req.headers['x-authkit-signature'] as string | undefined)
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise<void>((r) => server.listen(0, r))
    const port = (server.address() as any).port

    const sink = composeAuditSink(undefined, {
      webhook: { url: `http://127.0.0.1:${port}/hook` },
    })
    await sink.record({ type: 'signup', email: 'x@y.z' })

    await new Promise<void>((resolve) => {
      const tick = () => (captured.length > 0 ? resolve() : setTimeout(tick, 20))
      tick()
    })
    await new Promise<void>((r) => server.close(() => r()))

    assert.lengthOf(captured, 1)
    assert.isUndefined(captured[0])
  })

  test('webhook a URL inalcançável NÃO lança no record', async () => {
    const sink = composeAuditSink(undefined, {
      // porta improvável de estar aberta
      webhook: { url: 'http://127.0.0.1:1/hook' },
    })
    // não deve lançar
    await sink.record({ type: 'login.success', email: 'a@b.c' })
  })

  test('helpers buildWebhookBody/signWebhookBody são consistentes', ({ assert }) => {
    const body = buildWebhookBody({ type: 'pat.issued', accountId: 'a1' })
    const parsed = JSON.parse(body)
    assert.equal(parsed.type, 'pat.issued')
    assert.equal(parsed.accountId, 'a1')
    assert.isNull(parsed.email)
    const sig = signWebhookBody(body, 'k')
    assert.match(sig, /^sha256=[0-9a-f]{64}$/)
  })
})

test.group('events — resolveEvents + define_config wiring', () => {
  test('resolveEvents devolve undefined sem onEvent/webhook', ({ assert }) => {
    assert.isUndefined(resolveEvents(undefined))
    assert.isUndefined(resolveEvents({}))
  })

  test('define_config transforma audit num fan-out quando events está setado', async ({
    assert,
  }) => {
    const persisted: AuditEvent[] = []
    const observed: AuditEvent[] = []
    const original: AuditSink = { async record(e) { persisted.push(e) } }

    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      audit: original,
      events: { onEvent: (e) => void observed.push(e) },
    })

    const resolved = await configProvider.resolve(fakeApp(), provider)
    assert.isFunction(resolved.audit?.record)
    await resolved.audit!.record({ type: 'login.success', email: 'a@b.c' })
    assert.lengthOf(persisted, 1)
    assert.lengthOf(observed, 1)
  })

  test('sem events, audit permanece o sink original', async ({ assert }) => {
    const original: AuditSink = { async record() {} }
    const provider = defineConfig({
      issuer: 'https://auth.test',
      adapter: adapters.redis({ connection: 'main' }),
      jwks: { source: 'managed', algorithm: 'RS256' },
      clients: [{ clientId: 'app1', redirectUris: ['https://app1/cb'] }],
      accountStore: fakeAccountStore(),
      audit: original,
    })
    const resolved = await configProvider.resolve(fakeApp(), provider)
    assert.strictEqual(resolved.audit, original)
  })
})
