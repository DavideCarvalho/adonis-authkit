import type { ApplicationService } from '@adonisjs/core/types';
import type { OidcAdapter } from './adapter_contract.js';
import { DatabaseAdapter } from './database_adapter.js';
import { RedisAdapter } from './redis_adapter.js';

export type OidcAdapterClass = new (name: string) => OidcAdapter;

export interface AdapterFactory {
  resolver(app: ApplicationService): Promise<OidcAdapterClass>;
}

export interface RedisAdapterConfig {
  /** nome da conexão do @adonisjs/redis */
  connection: string;
  prefix?: string;
}

export interface DatabaseAdapterConfig {
  /** nome da conexão Lucid (default: a primária) */
  connection?: string;
}

export const adapters = {
  /**
   * Factory para o adapter Redis. O consumidor precisa ter o @adonisjs/redis
   * configurado, pois o resolver resolve o `RedisManager` pelo token `'redis'`
   * do container e obtém a conexão nomeada via `connection(name)`.
   */
  redis(config: RedisAdapterConfig): AdapterFactory {
    return {
      async resolver(app) {
        const redisManager = await app.container.make('redis');
        const client = (redisManager as any).connection(config.connection);
        const prefix = config.prefix ?? 'authkit';
        return class extends RedisAdapter {
          constructor(name: string) {
            super(name, client, prefix);
          }
        };
      },
    };
  },

  /**
   * Factory para o adapter de banco (Lucid). Resolve o `Database` manager pelo
   * token `'lucid.db'`. O `DatabaseAdapter` consome o manager diretamente
   * (`db.query()`/`db.table()`); quando uma conexão específica é solicitada,
   * usamos `db.connection(name)` para obter o cliente daquela conexão.
   */
  database(config: DatabaseAdapterConfig = {}): AdapterFactory {
    return {
      async resolver(app) {
        const db = await app.container.make('lucid.db');
        const connection = config.connection;
        const conn = connection ? (db as any).connection(connection) : db;
        return class extends DatabaseAdapter {
          constructor(name: string) {
            super(name, conn);
          }
        };
      },
    };
  },
};
