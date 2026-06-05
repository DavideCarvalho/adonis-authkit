import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { runAllChecks, hasErrors, type DoctorInput, type Finding } from '../src/doctor/checks.js'

/** Tenta importar um peer; true se importável. */
async function canImport(specifier: string): Promise<boolean> {
  try {
    await import(specifier)
    return true
  } catch {
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

    const authkitConfig = (config.get('authkit', null) as Record<string, any> | null) ?? null
    const sessionConfig = (config.get('session', null) as Record<string, any> | null) ?? null

    const input: DoctorInput = {
      authkitConfig,
      sessionConfig,
      peers: {
        session: await canImport('@adonisjs/session'),
        shield: await canImport('@adonisjs/shield'),
        ally: await canImport('@adonisjs/ally'),
        limiter: await canImport('@adonisjs/limiter'),
      },
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
