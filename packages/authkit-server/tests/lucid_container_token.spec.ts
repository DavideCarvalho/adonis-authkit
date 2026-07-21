import { test } from '@japa/runner'
import { AdminSessionsService } from '../src/host/admin_sessions_service.js'
import { setBootedApp } from '../services/booted_app.js'

/**
 * REGRESSION GUARD — dual-package hazard no `@adonisjs/lucid`.
 *
 * `AdminSessionsService.recordSubRevocation` PRECISA resolver o Lucid pelo ALIAS STRING `'lucid.db'`,
 * NUNCA importando `@adonisjs/lucid/services/db` (que resolve a CLASSE `Database` e a usa como TOKEN
 * do container).
 *
 * O provider do lucid registra `container.singleton(Database, ...)` chaveado no OBJETO da classe. Um
 * token-classe só casa quando o consumidor e o provider que bootou carregaram a MESMA cópia física do
 * pacote. Quando a árvore do host tem duas cópias — pins distintos, ou o mesmo pin resolvido sob peer
 * sets distintos, que o pnpm materializa em diretórios separados — os tokens diferem, nenhum binding
 * é achado, e o container tenta CONSTRUIR `Database`, que não tem `@inject()`:
 *
 *   RuntimeException: Cannot construct "[class Database]" class.
 *
 * Aqui a falha era AINDA PIOR: engolida por um catch best-effort, a revogação por `sub`
 * (`auth_session_revocations`) simplesmente deixava de ser gravada EM SILÊNCIO — nem crash, nem log.
 * Um token string não pode ser duplicado, então resolver pelo alias torna a lib independente da
 * deduplicação do host.
 *
 * A asserção é deliberadamente sobre o TOKEN, não sobre o resultado: um teste que só checasse o
 * insert passaria com qualquer implementação e deixaria o hazard voltar em silêncio.
 */

/** Subclasse que expõe o método `protected` para o teste. */
class ExposedSessions extends AdminSessionsService {
  async record(accountId: string, revokedAt?: Date): Promise<void> {
    return this.recordSubRevocation(accountId, revokedAt)
  }
}

/** OidcService mínimo — só o que o construtor lê. */
function fakeOidc(schemaConnection?: string): any {
  return {
    config: {
      AdapterClass: class {},
      accountStore: { findById: async () => null },
      schema: schemaConnection ? { connection: schemaConnection } : undefined,
    },
  }
}

/**
 * App mínimo cujo container registra todo token que é pedido a resolver, e devolve um `db` falso que
 * capta o insert emitido pelo `recordSubRevocation`.
 */
function appRecording(tokens: unknown[], inserted: any[], connections: Array<string | undefined>) {
  const db = {
    connection(name?: string) {
      connections.push(name)
      return {
        insertQuery() {
          return {
            table(_t: string) {
              return {
                async insert(row: any) {
                  inserted.push(row)
                },
              }
            },
          }
        },
      }
    },
  }
  return {
    container: {
      make: async (token: unknown) => {
        tokens.push(token)
        return db
      },
    },
  } as any
}

test.group('recordSubRevocation resolve o db pelo alias do container', (group) => {
  // Restaura o estado pristino do módulo booted_app (o resto da suíte assume que getBootedApp lança).
  group.each.teardown(() => {
    setBootedApp(undefined as any)
  })

  test('grava a revogação via o alias string, não via a classe Database', async ({ assert }) => {
    const tokens: unknown[] = []
    const inserted: any[] = []
    const connections: Array<string | undefined> = []
    setBootedApp(appRecording(tokens, inserted, connections))

    const svc = new ExposedSessions(fakeOidc())
    const when = new Date(1_700_000_000_000)
    await svc.record('acc-1', when)

    // O TOKEN resolvido é a string 'lucid.db' — não a classe Database.
    assert.deepEqual(tokens, ['lucid.db'])
    // Conexão default (sem schema.connection).
    assert.deepEqual(connections, [undefined])
    // O insert chegou ao db com o payload esperado.
    assert.lengthOf(inserted, 1)
    assert.equal(inserted[0].sub, 'acc-1')
    assert.isNull(inserted[0].sid)
    assert.strictEqual(inserted[0].revoked_at, when)
  })

  test('usa a conexão do schema quando configurada', async ({ assert }) => {
    const tokens: unknown[] = []
    const inserted: any[] = []
    const connections: Array<string | undefined> = []
    setBootedApp(appRecording(tokens, inserted, connections))

    const svc = new ExposedSessions(fakeOidc('auth'))
    await svc.record('acc-2')

    assert.deepEqual(tokens, ['lucid.db'])
    assert.deepEqual(connections, ['auth'])
    assert.lengthOf(inserted, 1)
    assert.equal(inserted[0].sub, 'acc-2')
  })

  test('falha ao resolver o db NÃO propaga (best-effort) mas é logada em error', async ({ assert }) => {
    const logs: Array<{ args: any[] }> = []
    // App cujo `make('lucid.db')` explode (simula o dual-package: make não acha o binding) e cujo
    // `make('logger')` devolve um logger que capta o erro.
    const app = {
      container: {
        make: async (token: unknown) => {
          if (token === 'logger') {
            return { error: (...args: any[]) => logs.push({ args }) }
          }
          throw new Error('Cannot construct "[class Database]" class.')
        },
      },
    } as any
    setBootedApp(app)

    const svc = new ExposedSessions(fakeOidc())
    // Não propaga.
    await svc.record('acc-3')

    // Mas foi logado em error (nunca silencioso).
    assert.lengthOf(logs, 1)
    const [ctx] = logs[0].args
    assert.equal(ctx.accountId, 'acc-3')
    assert.instanceOf(ctx.err, Error)
  })
})
