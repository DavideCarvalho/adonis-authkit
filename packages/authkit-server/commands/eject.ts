import { BaseCommand, flags } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';

const KNOWN_CONTROLLERS = [
  'interaction',
  'registration',
  'social',
  'account_session',
  'account_tokens',
  'pat_introspection',
] as const;

export default class AuthkitEject extends BaseCommand {
  static commandName = 'authkit:eject';
  static description =
    'Ejeta views Edge ou um controller do host-kit do @adonis-agora/authkit-server para customização local';

  static help = [
    'Use --views para copiar as views Edge da lib para resources/views/authkit/.',
    'Depois de ejetar as views, o app as servirá pelo ViewPath padrão',
    '(sem o disco authkit::) — renomeie as chamadas view() nos controllers.',
    '',
    'Use --controller=<nome> para copiar um controller do host-kit para',
    'app/controllers/authkit/<nome>_controller.ts e customizá-lo livremente.',
    '',
    `Controllers disponíveis: ${KNOWN_CONTROLLERS.join(', ')}`,
  ];

  static options: CommandOptions = {};

  @flags.boolean({
    description: 'Copia as views Edge da lib para resources/views/authkit/',
  })
  declare views: boolean;

  @flags.string({
    description: 'Copia um controller do host-kit (ex.: interaction) para app/controllers/authkit/',
  })
  declare controller?: string;

  async run() {
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    /**
     * Resolve o diretório dentro de `host/` — prefere o build compilado,
     * cai de volta para o src quando rodando no contexto de dev da lib.
     */
    const pickDir = (rel: string): URL => {
      const built = new URL(`../build/host/${rel}`, import.meta.url);
      const src = new URL(`../src/host/${rel}`, import.meta.url);
      return fs.existsSync(fileURLToPath(built)) ? built : src;
    };

    if (this.views) {
      const fromPath = fileURLToPath(pickDir('views'));
      if (!fs.existsSync(fromPath)) {
        this.logger.error(
          'Diretório de views não encontrado. Execute `pnpm build` no pacote primeiro.',
        );
        this.exitCode = 1;
        return;
      }
      const toPath = this.app.makePath('resources/views/authkit');
      fs.mkdirSync(toPath, { recursive: true });
      fs.cpSync(fromPath, toPath, { recursive: true });
      this.logger.success(`Views Edge ejetadas → ${toPath}`);
      this.logger.info(
        'Lembre-se de ajustar as chamadas view() nos controllers para usar o caminho local ao invés do disco authkit::.',
      );
    }

    if (this.controller) {
      const knownList = KNOWN_CONTROLLERS as readonly string[];
      if (!knownList.includes(this.controller)) {
        this.logger.error(
          `Controller desconhecido: "${this.controller}". Disponíveis: ${KNOWN_CONTROLLERS.join(', ')}`,
        );
        this.exitCode = 1;
        return;
      }

      const file = `${this.controller}_controller`;
      const fromDirPath = fileURLToPath(pickDir('controllers'));

      // Prefere .js (build) com fallback para .ts (src)
      const jsPath = `${fromDirPath}/${file}.js`;
      const tsPath = `${fromDirPath}/${file}.ts`;
      const fromFilePath = fs.existsSync(jsPath) ? jsPath : tsPath;
      const ext = fs.existsSync(jsPath) ? 'js' : 'ts';

      if (!fs.existsSync(fromFilePath)) {
        this.logger.error(
          `Arquivo do controller não encontrado: ${fromFilePath}. Execute \`pnpm build\` no pacote primeiro.`,
        );
        this.exitCode = 1;
        return;
      }

      const toDirPath = this.app.makePath('app/controllers/authkit');
      fs.mkdirSync(toDirPath, { recursive: true });
      const toFilePath = `${toDirPath}/${file}.${ext}`;
      fs.copyFileSync(fromFilePath, toFilePath);
      this.logger.success(`Controller "${this.controller}" ejetado → ${toFilePath}`);
      this.logger.info(
        `Atualize as rotas do host para apontar para app/controllers/authkit/${file}.`,
      );
    }

    if (!this.views && !this.controller) {
      this.logger.info('Nenhuma opção especificada. Use --views ou --controller=<nome>.');
      this.logger.info(`Controllers disponíveis: ${KNOWN_CONTROLLERS.join(', ')}`);
    }
  }
}
