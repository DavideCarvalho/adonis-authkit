import { RuntimeException } from '@adonisjs/core/exceptions'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Mensagem única (compartilhada entre o check EAGER do `boot()` e o resolver
 * LAZY do `register()`) para o erro de `appKey` ausente — um só lugar para
 * editar o texto, e garante que os dois caminhos falem exatamente a mesma coisa.
 */
export const MISSING_APP_KEY_MESSAGE =
  'APP_KEY ausente: defina `export const appKey = new Secret(env.get(\'APP_KEY\'))` em config/app.ts. ' +
  'O @adonis-agora/authkit-server precisa dele para assinar os cookies do oidc-provider (NÃO usa config/encryption.ts).'

/**
 * Lê e valida `app.appKey` (usado pelo oidc-provider para assinar cookies via
 * keygrip). `app.appKey` pode ser uma string crua ou um `Secret` do AdonisJS
 * (`config/app.ts` expõe `export const appKey = new Secret(env.get('APP_KEY'))`).
 *
 * Lança {@link RuntimeException} com uma mensagem que NOMEIA o arquivo e o campo
 * exatos a corrigir — nunca deixa o app seguir com uma appKey ausente/inválida
 * (o oidc-provider quebraria mais adiante com um erro genérico do keygrip,
 * sem apontar a causa raiz).
 */
export function resolveAppKey(app: ApplicationService): string {
  const rawAppKey = app.config.get<unknown>('app.appKey')
  const appKey =
    rawAppKey && typeof (rawAppKey as any).release === 'function'
      ? (rawAppKey as any).release()
      : (rawAppKey as string)
  if (!appKey || typeof appKey !== 'string') {
    throw new RuntimeException(MISSING_APP_KEY_MESSAGE)
  }
  return appKey
}
