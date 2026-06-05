import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { ClientConfig } from '@dudousxd/adonis-authkit-core'
import { importClients } from '../src/commands/import_clients.js'

/**
 * Migra os clients OIDC estáticos do config (campo `clients`) para o adapter/DB,
 * tornando-os gerenciáveis em runtime pelo console admin ou Admin API. Após a
 * migração, o campo `clients` pode ser removido do config sem redeploy.
 *
 * Idempotente: clients já existentes no adapter são pulados (secret preservado).
 */
export default class AuthkitImportClients extends BaseCommand {
  static commandName = 'authkit:clients:import'
  static description =
    'Migra clients OIDC do config estático para o adapter/DB (gerenciável via console/API sem redeploy).'

  static help = [
    'Copia os clients definidos em `clients: [...]` do config/authkit.ts para o adapter/DB',
    'usando o mesmo caminho de escrita do console admin e do registro dinâmico (RFC 7591).',
    '',
    'Cada client é processado individualmente:',
    '  - Já existe no adapter → pulado (secret e metadata originais preservados)',
    '  - Não existe → criado com o client_secret original do config (se confidencial)',
    '',
    'Após confirmar que todos os clients estão no adapter/DB, remova o bloco `clients`',
    'do config/authkit.ts. O servidor continuará funcionando sem ele.',
    '',
    'Exemplos:',
    '  node ace authkit:clients:import',
    '  node ace authkit:clients:import --dry-run',
  ]

  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Relata o que SERIA feito SEM persistir nada.' })
  declare dryRun?: boolean

  async run() {
    // Carrega a config authkit resolvida (via container).
    const service = await this.app.container.make('authkit.server')
    const config = service.config

    const clients = (config.clients ?? []) as ClientConfig[]
    if (clients.length === 0) {
      this.logger.info('Nenhum client estático encontrado no config — nada a migrar.')
      this.logger.info(
        'Para gerenciar clients, use o console admin (/admin/clients) ou a Admin API (/api/authkit/v1/clients).'
      )
      return
    }

    this.logger.info(`Encontrado(s) ${clients.length} client(s) estático(s) no config.`)
    if (this.dryRun) {
      this.logger.info('🧪 Dry-run — nenhum dado será persistido.\n')
    }

    // Importa usando o AdminClientsService (mesmo caminho do console/API).
    const { AdminClientsService } = await import('../src/host/admin_clients_service.js')
    const svc = new AdminClientsService(service)

    const report = await importClients(clients, svc, { dryRun: this.dryRun })

    // Imprime o relatório por client.
    for (const entry of report.entries) {
      if (entry.outcome === 'created') {
        const secretHint = entry.clientSecret
          ? ` (secret preservado — mostrado uma vez: ${entry.clientSecret})`
          : ' (public client — sem secret)'
        const prefix = this.dryRun ? '🔍 [dry-run] CRIARIA' : '✅ Criado'
        this.logger.success(`${prefix}: ${entry.clientId}${secretHint}`)
      } else if (entry.outcome === 'skipped') {
        this.logger.warning(`⚠️  Pulado: ${entry.clientId} (já existe no adapter — secret e metadata preservados)`)
      } else {
        this.logger.logError(`❌ Erro: ${entry.clientId} — ${entry.reason}`)
      }
    }

    this.logger.info('')
    if (this.dryRun) {
      this.logger.info(`Resumo (dry-run): ${report.created} seriam criados, ${report.skipped} pulados, ${report.errors} erro(s).`)
    } else {
      this.logger.success(`✅ Resumo: ${report.created} criado(s), ${report.skipped} pulado(s), ${report.errors} erro(s).`)
    }

    if (report.errors > 0) {
      this.exitCode = 1
      return
    }

    if (!this.dryRun) {
      this.logger.info('')
      this.logger.info(
        '👉 Próximo passo: remova o bloco `clients: [...]` do config/authkit.ts. ' +
          'O servidor continuará funcionando — clients são carregados do adapter/DB em runtime.'
      )
    }
  }
}
