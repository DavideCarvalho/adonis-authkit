import { Database } from '@adonisjs/lucid/database'
import { AppFactory } from '@adonisjs/core/factories/app'
import { LoggerFactory } from '@adonisjs/core/factories/logger'
import { EmitterFactory } from '@adonisjs/core/factories/events'
import type { AccountStore, AuthAccount } from '../src/accounts/account_store.js'

/** Database Lucid standalone sobre sqlite em memória, para testar o DatabaseAdapter/mixins. */
export function createTestDatabase() {
  const app = new AppFactory().create(new URL('./', import.meta.url), () => {}) as any
  const logger = new LoggerFactory().create()
  const emitter = new EmitterFactory().create(app)
  const db = new Database(
    {
      connection: 'sqlite',
      connections: {
        sqlite: {
          client: 'better-sqlite3',
          connection: { filename: ':memory:' },
          useNullAsDefault: true,
        },
      },
    },
    logger,
    emitter
  )
  return db
}

/**
 * AccountStore mínimo pra testes. Por padrão resolve qualquer `findById` como
 * um usuário fixo e `verifyCredentials` por email. Sobrescreva campos conforme o teste.
 */
export function fakeAccountStore(overrides: Partial<AccountStore> = {}): AccountStore {
  const fixed: AuthAccount = { id: 'u1', email: 'a@b.com', globalRoles: ['ADMIN'] }
  return {
    findById: async (id) => ({ ...fixed, id }),
    verifyCredentials: async (email) => (email === fixed.email ? { ...fixed } : null),
    findByEmail: async (email) => (email === fixed.email ? { ...fixed } : null),
    create: async (input) => ({ id: 'new', email: input.email, globalRoles: input.globalRoles ?? [] }),
    findByProviderIdentity: async () => null,
    linkProviderIdentity: async () => {},
    issuePasswordResetToken: async () => null,
    consumePasswordResetToken: async () => false,
    issueEmailVerificationToken: async () => null,
    consumeEmailVerificationToken: async () => false,
    listAccounts: async () => ({ data: [{ ...fixed }], total: 1 }),
    setGlobalRoles: async () => {},
    ...overrides,
  }
}
