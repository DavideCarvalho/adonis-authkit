import { test } from '@japa/runner'
import { notifyLoginSuccess } from '../../src/host/login_notify.js'
import { __setMailLoaderForTests } from '../../src/host/default_mailer.js'
import type { ResolvedServerConfig } from '../../src/define_config.js'
import type {
  AuditEvent,
  AuditPage,
  AuditSink,
  ListAuditParams,
  StoredAuditEvent,
} from '../../src/audit/audit_sink.js'

/** Sink de auditoria in-memory com consulta (filtra por type + subject). */
function memorySink(): AuditSink & { events: StoredAuditEvent[] } {
  const events: StoredAuditEvent[] = []
  let seq = 0
  return {
    events,
    async record(event: AuditEvent) {
      events.push({ ...event, id: String(++seq), createdAt: new Date().toISOString() })
    },
    async list(params: ListAuditParams): Promise<AuditPage> {
      const data = events.filter(
        (e) =>
          (!params.type || e.type === params.type) &&
          (!params.subject || e.accountId === params.subject)
      )
      return { data, total: data.length }
    },
  }
}

/** Sink write-only (sem `list`). */
function writeOnlySink(): AuditSink & { events: AuditEvent[] } {
  const events: AuditEvent[] = []
  return {
    events,
    async record(event: AuditEvent) {
      events.push(event)
    },
  }
}

/** Mailer stub que captura os envios. */
function stubMailer() {
  const sent: any[] = []
  const mailStub = {
    send: async (cb: any) => {
      const message: any = {
        from() {
          return this
        },
        to(v: any) {
          this._to = v
          return this
        },
        subject(v: any) {
          this._subject = v
          return this
        },
        html(v: any) {
          this._html = v
          return this
        },
        text(v: any) {
          this._text = v
          return this
        },
      }
      cb(message)
      sent.push(message)
    },
  }
  __setMailLoaderForTests(() => Promise.resolve(mailStub))
  return sent
}

function fakeCtx() {
  return {
    logger: { info() {}, error() {} },
    request: {
      protocol: () => 'https',
      host: () => 'idp.test',
    },
  } as any
}

function cfgWith(audit: AuditSink | undefined, newLoginEmail = true): ResolvedServerConfig {
  return {
    notifications: { newLoginEmail },
    audit,
    accountStore: {
      findById: async (id: string) => ({ id, email: `${id}@x.com`, globalRoles: [] }),
    },
  } as unknown as ResolvedServerConfig
}

/** Aguarda a tarefa fire-and-forget da notificação concluir (poll de microtasks). */
async function flush(predicate: () => boolean, ticks = 50) {
  for (let i = 0; i < ticks; i++) {
    if (predicate()) return
    await new Promise((r) => setImmediate(r))
  }
}

test.group('notifyLoginSuccess (alerta de novo acesso)', (group) => {
  group.each.teardown(() => __setMailLoaderForTests(undefined))

  test('primeiro login de um IP dispara o e-mail + audita login.new_ip_notified', async ({
    assert,
  }) => {
    const sent = stubMailer()
    const sink = memorySink()
    const cfg = cfgWith(sink)

    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u1', email: 'u1@x.com', ip: '1.1.1.1' })
    await flush(() => sent.length > 0)

    assert.lengthOf(sent, 1)
    assert.equal(sent[0]._to, 'u1@x.com')
    assert.equal(sent[0]._subject, 'New login to your account')
    assert.include(sent[0]._text, '1.1.1.1')
    // Auditou login.success + login.new_ip_notified.
    assert.isOk(sink.events.find((e) => e.type === 'login.success'))
    assert.isOk(sink.events.find((e) => e.type === 'login.new_ip_notified'))
  })

  test('login repetido do MESMO IP não dispara novo e-mail', async ({ assert }) => {
    const sent = stubMailer()
    const sink = memorySink()
    const cfg = cfgWith(sink)

    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u1', email: 'u1@x.com', ip: '2.2.2.2' })
    await flush(() => sent.length > 0)
    assert.lengthOf(sent, 1)

    // Segundo login do mesmo IP: já há um login.success deste IP → não notifica.
    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u1', email: 'u1@x.com', ip: '2.2.2.2' })
    await flush(() => false, 10)
    assert.lengthOf(sent, 1)
  })

  test('sink sem `list` → no-op (não envia e-mail)', async ({ assert }) => {
    const sent = stubMailer()
    const sink = writeOnlySink()
    const cfg = cfgWith(sink)

    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u1', email: 'u1@x.com', ip: '3.3.3.3' })
    await flush(() => false, 10)
    assert.lengthOf(sent, 0)
    // O login.success ainda foi auditado.
    assert.isOk(sink.events.find((e) => e.type === 'login.success'))
  })

  test('newLoginEmail:false desliga o alerta', async ({ assert }) => {
    const sent = stubMailer()
    const sink = memorySink()
    const cfg = cfgWith(sink, false)

    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u1', email: 'u1@x.com', ip: '4.4.4.4' })
    await flush(() => false, 10)
    assert.lengthOf(sent, 0)
  })

  test('resolve o e-mail via accountStore quando o caller não fornece (fluxo MFA)', async ({
    assert,
  }) => {
    const sent = stubMailer()
    const sink = memorySink()
    const cfg = cfgWith(sink)

    // Sem `email` no input → resolvido por findById ('u9@x.com').
    await notifyLoginSuccess(fakeCtx(), cfg, { accountId: 'u9', ip: '5.5.5.5' })
    await flush(() => sent.length > 0)
    assert.lengthOf(sent, 1)
    assert.equal(sent[0]._to, 'u9@x.com')
  })
})
