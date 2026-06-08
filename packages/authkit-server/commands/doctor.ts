import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { runAllChecks, hasErrors, type DoctorInput, type Finding } from '../src/doctor/checks.js'
import { DatabaseAdapter } from '../src/adapters/database_adapter.js'
import { resolveAuthkitConfig } from '../src/commands/resolve_config.js'

/** Logger mínimo para reportar peers instalados-mas-quebrados. */
interface CanImportLogger {
  warning(msg: string): void
}

/**
 * Tenta importar um peer; `true` se importável.
 *
 * Distingue "não instalado" de "instalado mas quebrado": só um erro de
 * módulo-não-encontrado (`ERR_MODULE_NOT_FOUND`/`MODULE_NOT_FOUND`) é tratado como
 * peer ausente (silencioso — é o caso esperado). Qualquer outro erro significa que
 * o peer ESTÁ presente mas falhou ao carregar (import circular, erro de sintaxe,
 * config inválida) — isso o doctor precisa gritar, senão um peer quebrado aparece
 * como "ausente" e o diagnóstico mente.
 */
async function canImport(specifier: string, logger?: CanImportLogger): Promise<boolean> {
  try {
    await import(specifier)
    return true
  } catch (err) {
    const code = (err as { code?: string } | null)?.code
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
      logger?.warning(
        `⚠️  ${specifier} está instalado mas falhou ao carregar: ${(err as Error).message}`
      )
    }
    return false
  }
}

export default class AuthkitDoctor extends BaseCommand {
  static commandName = 'authkit:doctor'
  static description =
    'Valida a configuração do AuthKit no host e imprime achados (✅/⚠️/❌). Sai com código !=0 se houver erros.'

  static help = [
    'Roda uma bateria de checagens sobre a config `authkit` do host:',
    'issuer/mountPath, clients, accountStore + capacidades, session, shield,',
    'ally (social), rate-limit, admin, webauthn e jwks.',
  ]

  static options: CommandOptions = { startApp: true }

  async run() {
    const config = await this.app.container.make('config')

    // `defineConfig` exporta um config provider — resolve antes de inspecionar,
    // senão todo campo aparece como "ausente" (provider cru não tem issuer etc.).
    let authkitConfig: Record<string, any> | null = null
    try {
      authkitConfig = await resolveAuthkitConfig(this.app, config.get('authkit', null))
    } catch (error) {
      this.logger.logError(
        `❌ config/authkit.ts falhou ao resolver: ${(error as Error).message}`
      )
      this.exitCode = 1
      return
    }
    const sessionConfig = (config.get('session', null) as Record<string, any> | null) ?? null

    const input: DoctorInput = {
      authkitConfig,
      sessionConfig,
      peers: {
        session: await canImport('@adonisjs/session', this.logger),
        shield: await canImport('@adonisjs/shield', this.logger),
        ally: await canImport('@adonisjs/ally', this.logger),
        limiter: await canImport('@adonisjs/limiter', this.logger),
      },
      __adapterClasses: { DatabaseAdapter },
    }

    const findings = runAllChecks(input)
    this.print(findings)

    if (hasErrors(findings)) {
      this.exitCode = 1
    }
  }

  private print(findings: Finding[]) {
    const icon = (l: Finding['level']) => (l === 'ok' ? '✅' : l === 'warn' ? '⚠️ ' : '❌')
    this.logger.info('AuthKit doctor — checagem da configuração do host\n')
    for (const f of findings) {
      const line = `${icon(f.level)} ${f.message}`
      if (f.level === 'error') this.logger.logError(line)
      else if (f.level === 'warn') this.logger.warning(line)
      else this.logger.success(line)
    }

    const errors = findings.filter((f) => f.level === 'error').length
    const warns = findings.filter((f) => f.level === 'warn').length
    this.logger.info(`\nResumo: ${errors} erro(s), ${warns} aviso(s).`)
  }
}
