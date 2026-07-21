import { BaseSchema } from '@adonisjs/lucid/schema';

export default class extends BaseSchema {
  protected tableName = 'authkit_oidc_payloads';

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('id', 255).notNullable();
      table.string('model_name', 100).notNullable();
      table.text('payload').notNullable();
      table.string('grant_id', 255).nullable().index();
      table.string('user_code', 255).nullable().index();
      table.string('uid', 255).nullable().index();
      table.timestamp('expires_at', { useTz: true }).nullable();
      table.primary(['model_name', 'id']);
    });
  }

  async down() {
    this.schema.dropTable(this.tableName);
  }
}
