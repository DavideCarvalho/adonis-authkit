import { test } from '@japa/runner';
import { DatabaseAdapter } from '../src/adapters/database_adapter.js';
import { createTestDatabase } from './bootstrap.js';

async function migrate(db: any) {
  await db.connection().schema.createTable('authkit_oidc_payloads', (t: any) => {
    t.string('id').notNullable();
    t.string('model_name').notNullable();
    t.text('payload').notNullable();
    t.string('grant_id').nullable();
    t.string('user_code').nullable();
    t.string('uid').nullable();
    t.timestamp('expires_at').nullable();
    t.primary(['model_name', 'id']);
  });
}

test.group('DatabaseAdapter', (group) => {
  let db: any;
  group.each.setup(async () => {
    db = createTestDatabase();
    await migrate(db);
    return async () => db.manager.closeAll();
  });

  test('upsert + find', async ({ assert }) => {
    const a = new DatabaseAdapter('AccessToken', db);
    await a.upsert('t1', { jti: 't1', accountId: 'u1' }, 60);
    assert.deepInclude(await a.find('t1'), { jti: 't1', accountId: 'u1' });
  });

  test('consume seta consumed', async ({ assert }) => {
    const a = new DatabaseAdapter('AuthorizationCode', db);
    await a.upsert('c1', { jti: 'c1' }, 60);
    await a.consume('c1');
    assert.isOk((await a.find('c1'))!.consumed);
  });

  test('revokeByGrantId apaga por grant', async ({ assert }) => {
    const a = new DatabaseAdapter('AccessToken', db);
    await a.upsert('x', { jti: 'x', grantId: 'G' }, 60);
    await a.revokeByGrantId('G');
    assert.isUndefined(await a.find('x'));
  });

  test('find expirado devolve undefined', async ({ assert }) => {
    const a = new DatabaseAdapter('AccessToken', db);
    await a.upsert('e', { jti: 'e' }, -1); // já expirado
    assert.isUndefined(await a.find('e'));
  });
});
