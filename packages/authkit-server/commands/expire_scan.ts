import { BaseCommand, flags } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';
import { runExpireScan } from '../src/commands/expire_scan_command.js';

/**
 * Varre contas inativas e reporta expiradas/a expirar.
 *
 * Mecânica:
 *   - "Última atividade" = último `login.success` da conta no audit (list capability).
 *   - Sem audit queryável → aborta com aviso.
 *   - --warn: envia e-mail de aviso às contas a expirar em breve (deduplicado via audit).
 *   - --dry-run: reporta sem enviar e-mails nem auditar.
 *   - --json: output machine-readable (estrutura ExpireScanResult).
 *
 * Exemplos:
 *   node ace authkit:accounts:expire-scan
 *   node ace authkit:accounts:expire-scan --dry-run
 *   node ace authkit:accounts:expire-scan --warn
 *   node ace authkit:accounts:expire-scan --warn --json
 */
export default class AuthkitExpireScan extends BaseCommand {
  static commandName = 'authkit:accounts:expire-scan';
  static description =
    'Varre contas inativas (account_expiration setting) e reporta expiradas/a expirar. Com --warn envia e-mail de aviso. Pensado para cron do host.';

  static help = [
    'Varre o account store buscando contas inativas (sem login.success no audit há N dias).',
    'Requer account_expiration.enabled = true na auth_settings E audit sink queryável (list).',
    '',
    'Exemplos:',
    '  node ace authkit:accounts:expire-scan              # lista sem e-mail',
    '  node ace authkit:accounts:expire-scan --dry-run    # preview sem auditar',
    '  node ace authkit:accounts:expire-scan --warn       # envia e-mails de aviso',
    '  node ace authkit:accounts:expire-scan --warn --json',
  ];

  static options: CommandOptions = { startApp: true };

  @flags.boolean({ description: 'Reporta sem enviar e-mails nem auditar.' })
  declare dryRun?: boolean;

  @flags.boolean({
    description: 'Envia e-mail de aviso às contas a expirar em breve (deduplicado via audit).',
  })
  declare warn?: boolean;

  @flags.boolean({ description: 'Output em JSON machine-readable (estrutura ExpireScanResult).' })
  declare json?: boolean;

  async run() {
    const result = await runExpireScan(this.app, {
      dryRun: this.dryRun,
      warn: this.warn,
      json: this.json,
      logger: {
        info: (m: string) => this.logger.info(m),
        warn: (m: string) => this.logger.warning(m),
        error: (m: string) => this.logger.error(m),
      },
    });

    if (this.json) {
      this.logger.info(JSON.stringify(result, null, 2));
      return;
    }

    const { summary, expired, warnSoon } = result;

    this.logger.info(`[expire-scan] Scanned: ${summary.scanned} accounts`);
    this.logger.info(`[expire-scan] Expired (blocked at login): ${summary.expired}`);
    this.logger.info(
      `[expire-scan] Expiring soon (within ${summary.warnDays}d): ${summary.warnSoon}`,
    );
    if (result.warned > 0) {
      this.logger.info(`[expire-scan] Warning emails sent: ${result.warned}`);
    }
    if (result.deduped > 0) {
      this.logger.info(`[expire-scan] Deduped (already warned): ${result.deduped}`);
    }

    if (expired.length > 0) {
      this.logger.warning('[expire-scan] Expired accounts:');
      for (const acc of expired) {
        this.logger.warning(
          `  ${acc.email} (${acc.accountId}) — last activity ${acc.lastActivityDaysAgo ?? '?'} days ago`,
        );
      }
    }

    if (warnSoon.length > 0) {
      this.logger.info('[expire-scan] Expiring soon:');
      for (const acc of warnSoon) {
        this.logger.info(
          `  ${acc.email} (${acc.accountId}) — expires in ${acc.expiresInDays} days`,
        );
      }
    }

    if (!summary.auditSupported) {
      this.logger.warning('[expire-scan] Audit sink does not support list(). Feature unavailable.');
    }

    if (summary.dryRun) {
      this.logger.info('[expire-scan] DRY RUN — no emails sent, no audit events recorded.');
    }
  }
}
