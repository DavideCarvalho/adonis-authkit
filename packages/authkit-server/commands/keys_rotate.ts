import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import {
  rotateKeystore,
  readKeystore,
  planRotation,
  signingKeyAgeDays,
} from '../src/keys/keystore.js'
import type { SigningAlg } from '../src/keys/jwks_manager.js'
import type { AuditSink } from '../src/audit/audit_sink.js'

/**
 * Rotação de chaves de assinatura JWKS (padrão OIDC). Gera uma chave nova, passa a
 * ASSINAR com ela e mantém as antigas publicadas no JWKS por um período de graça
 * (tokens emitidos antes continuam validando). `--retire` remove TODAS as antigas
 * de imediato; `--dry-run` apenas imprime o plano sem tocar o keystore.
 *
 * Substitui o legado `authkit:rotate-keys` (mantido como alias). Quando a config
 * resolvida traz um `audit` sink, registra o evento `keys.rotated` (best-effort).
 */
export default class AuthkitKeysRotate extends BaseCommand {
  static commandName = 'authkit:keys:rotate'
  static description =
    'Rotaciona as chaves de assinatura JWKS managed: gera uma nova chave (novo kid) que passa a assinar e mantém as anteriores no JWKS por um período de graça (--retire remove de imediato; --dry-run só mostra o plano).'

  static help = [
    'Requer `jwks: { source: "managed", store: "<arquivo>" }` na config authkit.',
    'A chave nova vira a de assinatura corrente; as `--keep` mais recentes são',
    'preservadas no JWKS público para que tokens emitidos antes ainda validem.',
    '',
    '  node ace authkit:keys:rotate            # rotaciona mantendo 2 chaves',
    '  node ace authkit:keys:rotate --dry-run  # só mostra o plano',
    '  node ace authkit:keys:rotate --retire   # remove TODAS as chaves antigas',
    '  node ace authkit:keys:rotate --keep=3   # mantém 3 chaves no JWKS',
  ]

  static options: CommandOptions = { startApp: true }

  @flags.number({ description: 'Quantas chaves manter no JWKS (default 2).' })
  declare keep?: number

  @flags.boolean({ description: 'Apenas mostra o plano da rotação; NÃO altera o keystore.' })
  declare dryRun?: boolean

  @flags.boolean({
    description: 'Remove TODAS as chaves antigas de imediato (sem período de graça).',
  })
  declare retire?: boolean

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
    const retire = this.retire ?? false

    const current = readKeystore(storePath)
    const ageDays = signingKeyAgeDays(current)
    if (ageDays !== null) {
      this.logger.info(`Chave de assinatura corrente tem ~${ageDays} dia(s) de idade.`)
    }

    // --dry-run: imprime o plano (puro, sem gerar chave nem tocar disco) e sai.
    if (this.dryRun) {
      const plan = planRotation(current, keep, retire)
      this.logger.info('Plano de rotação (dry-run — nada foi alterado):')
      this.logger.info(`  • chave corrente: ${plan.currentKid ?? '(nenhuma — keystore vazio)'}`)
      this.logger.info(`  • após rotação o JWKS manteria ${plan.keep} chave(s)`)
      this.logger.info(`  • mantidas: ${plan.keptKids.join(', ')}`)
      if (plan.retiredKids.length) {
        this.logger.warning(`  • aposentadas: ${plan.retiredKids.join(', ')}`)
      } else {
        this.logger.info('  • aposentadas: nenhuma')
      }
      return
    }

    const { newKid, retiredKids, store: result } = await rotateKeystore(
      storePath,
      alg,
      keep,
      retire
    )

    this.logger.success(`✅ Nova chave de assinatura gerada: kid=${newKid} (alg=${alg}).`)
    this.logger.info(
      `JWKS agora serve ${result.keys.length} chave(s) (kids: ${result.keys.map((k) => k.kid).join(', ')}).`
    )
    if (retiredKids.length) {
      this.logger.warning(
        `⚠️  Chaves aposentadas (tokens assinados por elas deixarão de validar): ${retiredKids.join(', ')}`
      )
    }
    this.logger.info('Reinicie o processo (ou recarregue a config) para passar a assinar com a nova chave.')

    // Audit event best-effort: a config resolvida expõe o sink em `audit`.
    const sink = authkitConfig.audit as AuditSink | undefined
    if (sink && typeof sink.record === 'function') {
      try {
        await sink.record({
          type: 'keys.rotated',
          metadata: {
            newKid,
            retiredKids,
            keptKids: result.keys.map((k) => k.kid),
            retire,
            alg,
          },
        })
      } catch {
        // best-effort: nunca falha a rotação por causa do log de auditoria.
      }
    }
  }
}
