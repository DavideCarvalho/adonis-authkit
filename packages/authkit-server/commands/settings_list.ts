import { BaseCommand, flags } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';
import { settingsList } from '../src/commands/settings_commands.js';

/**
 * Lista todas as runtime settings presentes em `auth_settings`.
 *
 * Exemplo:
 *   node ace authkit:settings:list
 *   node ace authkit:settings:list --json
 */
export default class AuthkitSettingsList extends BaseCommand {
  static commandName = 'authkit:settings:list';
  static description = 'Lista todas as runtime settings presentes em `auth_settings`.';

  static help = [
    'Lista todas as settings salvas na tabela `auth_settings`, com key, valor e metadados.',
    '',
    'Exemplos:',
    '  node ace authkit:settings:list',
    '  node ace authkit:settings:list --json',
  ];

  static options: CommandOptions = { startApp: true };

  @flags.boolean({ description: 'Output em JSON machine-readable.' })
  declare json?: boolean;

  async run() {
    await settingsList(this.app, {
      json: this.json,
      logger: {
        info: (m: string) => this.logger.info(m),
        warn: (m: string) => this.logger.warning(m),
      },
    });
  }
}
