import { test } from '@japa/runner';

test('harness roda', ({ assert }) => {
  assert.isTrue(true);
});

test('createTestDatabase faz uma query real', async ({ assert }) => {
  const { createTestDatabase } = await import('./bootstrap.js');
  const db = createTestDatabase();
  await db.connection().schema.createTable('probe', (t: any) => {
    t.increments('id');
    t.string('name');
  });
  await db.table('probe').insert({ name: 'x' });
  const row = await db.query().from('probe').where('name', 'x').first();
  assert.equal(row.name, 'x');
  await db.manager.closeAll();
});
