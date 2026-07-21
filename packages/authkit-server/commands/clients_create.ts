import { BaseCommand, flags } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';

/**
 * Cria um client OIDC no adapter/DB via {@link AdminClientsService}. O client fica
 * disponível em runtime imediatamente, sem necessidade de redeploy. Para clients
 * confidenciais, o secret é gerado aleatoriamente e impresso UMA ÚNICA VEZ — não é
 * recuperável depois.
 *
 * Exemplos:
 *   node ace authkit:clients:create --client-id=my-spa --redirect-uri=https://app/cb --public
 *   node ace authkit:clients:create --client-id=my-api --redirect-uri=https://api/cb --redirect-uri=https://api/cb2 --grant=client_credentials
 *   node ace authkit:clients:create --redirect-uri=https://app/cb --json
 */
export default class AuthkitClientsCreate extends BaseCommand {
  static commandName = 'authkit:clients:create';
  static description =
    'Cria um client OIDC no adapter/DB em runtime (sem redeploy). O secret é impresso uma vez.';

  static help = [
    'Cria um client OIDC persistido no adapter via AdminClientsService, o mesmo',
    'caminho usado pelo console admin e pelo registro dinâmico (RFC 7591).',
    '',
    'Para clients confidenciais (default), um secret aleatório é gerado e',
    'impresso UMA ÚNICA VEZ no terminal — armazene-o imediatamente.',
    '',
    'Flags repetíveis (--flag=v1 --flag=v2):',
    '  --redirect-uri      URI(s) de callback do client (obrigatório).',
    '  --post-logout-uri   URI(s) de post-logout redirect.',
    '  --grant             Grant types. Default: authorization_code + refresh_token.',
    '',
    'Exemplos:',
    '  node ace authkit:clients:create --client-id=my-spa --redirect-uri=https://app/cb --public',
    '  node ace authkit:clients:create --redirect-uri=https://app/cb --backchannel-logout-uri=https://app/bc',
    '  node ace authkit:clients:create --client-id=my-app --redirect-uri=https://a/cb --redirect-uri=https://b/cb --json',
  ];

  static options: CommandOptions = { startApp: true };

  @flags.string({ description: 'client_id desejado. Omitir gera um UUID aleatório.' })
  declare clientId?: string;

  @flags.array({ description: 'redirect_uri(s) permitidas (repetível). Obrigatório.' })
  declare redirectUri?: string[];

  @flags.array({ description: 'post_logout_redirect_uri(s) permitidas (repetível).' })
  declare postLogoutUri?: string[];

  @flags.array({
    description: 'Grant types (repetível). Default: authorization_code + refresh_token.',
  })
  declare grant?: string[];

  @flags.boolean({
    description:
      'Cria um client público (sem secret; token_endpoint_auth_method=none). Default: false (confidencial).',
  })
  declare public?: boolean;

  @flags.string({
    description: 'Endpoint de OIDC Back-Channel Logout do RP (POST de logout_token).',
  })
  declare backchannelLogoutUri?: string;

  @flags.boolean({
    description: 'Output em JSON machine-readable (inclui clientId e clientSecret).',
  })
  declare json?: boolean;

  async run() {
    const redirectUris = this.redirectUri ?? [];
    if (redirectUris.length === 0) {
      this.logger.logError('❌ --redirect-uri é obrigatório. Passe ao menos uma URI de callback.');
      this.exitCode = 1;
      return;
    }

    const service = await this.app.container.make('authkit.server');
    const { AdminClientsService } = await import('../src/host/admin_clients_service.js');
    const svc = new AdminClientsService(service);

    const grantTypes =
      this.grant && this.grant.length > 0 ? this.grant : ['authorization_code', 'refresh_token'];

    const tokenEndpointAuthMethod = this.public
      ? ('none' as const)
      : ('client_secret_basic' as const);

    const created = await svc.create({
      clientId: this.clientId,
      redirectUris,
      postLogoutRedirectUris: this.postLogoutUri ?? [],
      grantTypes,
      tokenEndpointAuthMethod,
      backchannelLogoutUri: this.backchannelLogoutUri,
    });

    if (this.json) {
      const out: Record<string, unknown> = {
        clientId: created.clientId,
        redirectUris,
        postLogoutRedirectUris: this.postLogoutUri ?? [],
        grantTypes,
        tokenEndpointAuthMethod,
        confidential: !this.public,
      };
      if (created.clientSecret) out.clientSecret = created.clientSecret;
      if (this.backchannelLogoutUri) out.backchannelLogoutUri = this.backchannelLogoutUri;
      this.logger.info(JSON.stringify(out, null, 2));
      return;
    }

    this.logger.success(`Client criado: ${created.clientId}`);
    this.logger.info(`  redirect_uris: ${redirectUris.join(', ')}`);
    this.logger.info(`  grant_types:   ${grantTypes.join(', ')}`);
    this.logger.info(`  type:          ${this.public ? 'publico (sem secret)' : 'confidencial'}`);
    if (this.backchannelLogoutUri) {
      this.logger.info(`  backchannel:   ${this.backchannelLogoutUri}`);
    }

    if (created.clientSecret) {
      this.logger.info('');
      this.logger.success('CLIENT SECRET (mostrado UMA vez - armazene agora):');
      this.logger.success(`  ${created.clientSecret}`);
      this.logger.info('');
    }
  }
}
