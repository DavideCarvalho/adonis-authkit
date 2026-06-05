import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import { rotateKeystore } from '../src/keys/keystore.js'
import type { SigningAlg } from '../src/keys/jwks_manager.js'

export default class AuthkitRotateKeys extends BaseCommand {
  static commandName = 'authkit:rotate-keys'
  static description =
    'Rotaciona as chaves de assinatura JWKS managed: gera uma nova chave (novo kid), mantém as N anteriores no JWKS para validar tokens antigos.'

  static help = [
    'Requer `jwks: { source: "managed", store: "<arquivo>" }` na config authkit.',
    'A chave nova vira a de assinatura corrente; as `--keep` mais recentes são',
    'preservadas no JWKS público para que tokens emitidos antes ainda validem.',
  ]

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Quantas chaves manter no JWKS (default 2).' })
  declare keep?: number

  async run() {
    const config = await this.app.container.make('config')
    const authkitConfig = config.get('authkit', null) as Record<string, any> | null

    if (!authkitConfig?.jwks) {
      this.logger.logError("❌ config('authkit').jwks ausente.")
      this.exitCode = 1
      return
    }

    const { source, store, algorithm } = authkitConfig.jwks as {
      source?: string
      store?: string
      algorithm?: SigningAlg
    }

    if (source !== 'managed') {
      this.logger.logError('❌ Rotação só se aplica a jwks.source = "managed".')
      this.exitCode = 1
      return
    }

    if (!store) {
      this.logger.logError(
        '❌ jwks.store não configurado. A rotação exige um keystore persistido em arquivo ' +
          '(ex.: jwks: { source: "managed", store: "tmp/authkit_jwks.json" }). ' +
          'Sem store, o modo managed gera uma chave efêmera por boot e rotacionar não tem efeito.'
      )
      this.exitCode = 1
      return
    }

    const storePath = this.app.makePath(store)
    const alg: SigningAlg = algorithm ?? 'RS256'
    const keep = this.keep ?? 2

    const { newKid, retiredKids, store: result } = await rotateKeystore(storePath, alg, keep)

    this.logger.success(`✅ Nova chave de assinatura gerada: kid=${newKid} (alg=${alg}).`)
    this.logger.info(`JWKS agora serve ${result.keys.length} chave(s) (kids: ${result.keys.map((k) => k.kid).join(', ')}).`)
    if (retiredKids.length) {
      this.logger.warning(`⚠️  Chaves aposentadas (tokens assinados por elas deixarão de validar): ${retiredKids.join(', ')}`)
    }
    this.logger.info('Reinicie o processo (ou recarregue a config) para passar a assinar com a nova chave.')
  }
}
