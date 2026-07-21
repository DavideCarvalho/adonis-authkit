import { compose } from '@adonisjs/core/helpers';
import { BaseModel, column } from '@adonisjs/lucid/orm';
import { test } from '@japa/runner';
import { withAuthUser } from '../src/mixins/with_auth_user.js';
import { createTestDatabase } from './bootstrap.js';

test.group('withAuthUser mixin', (group) => {
  let db: any;
  group.each.setup(async () => {
    db = createTestDatabase();
    BaseModel.useAdapter(db.modelAdapter());
    await db.connection().schema.createTable('auth_users', (t: any) => {
      t.string('id').primary();
      t.string('email').notNullable();
      t.string('password').notNullable();
      t.text('global_roles').nullable();
    });
    return async () => db.manager.closeAll();
  });

  test('expõe colunas e verifyPassword', async ({ assert }) => {
    class AuthUser extends compose(BaseModel, withAuthUser()) {
      static table = 'auth_users';
      @column({ isPrimary: true })
      declare id: string;
    }
    const u = await AuthUser.create({
      id: 'u1',
      email: 'a@b.com',
      password: 'secret123',
      globalRoles: ['ADMIN'],
    });
    assert.isTrue(await u.verifyPassword('secret123'));
    assert.isFalse(await u.verifyPassword('errado'));
    assert.notEqual(u.password, 'secret123'); // hash, não plaintext
    assert.deepEqual(u.globalRoles, ['ADMIN']);
  });
});
