import type { Identity } from '@adonis-agora/authkit-core'

/** Model Lucid mínimo que o mirror precisa (só `updateOrCreate`). */
interface LucidModelLike {
  updateOrCreate(search: Record<string, unknown>, payload: Record<string, unknown>): Promise<any>
}

export interface LucidMirrorOptions {
  /**
   * Campos a sincronizar das claims do id_token a cada login (além do id). Default:
   * `{ email }`. Ex.: `(i) => ({ email: i.email, fullName: i.profile?.name ?? null })`.
   */
  sync?: (identity: Identity) => Record<string, unknown>
  /** Relações Lucid a pré-carregar no usuário resolvido (ex.: `['roles']`). */
  preload?: string[]
  /**
   * Injeta `identity.globalRoles` numa propriedade NÃO persistida do usuário (p/ policies).
   * `true` → `globalRoles`; string → nome custom da propriedade.
   */
  injectGlobalRoles?: boolean | string
  /** Coluna que casa com `identity.userId`. Default: `id`. */
  idColumn?: string
}

/**
 * Factory do padrão "espelho local" de `resolveUser`: faz `updateOrCreate` do usuário
 * de domínio a partir das claims do id_token, opcionalmente pré-carrega relações e
 * injeta os papéis globais. Substitui o `resolveUser` que cada app reescrevia.
 *
 * ```ts
 * resolveUser: lucidMirror(AppUser, {
 *   sync: (i) => ({ email: i.email, fullName: i.profile?.name ?? null }),
 *   preload: ['roles'],
 *   injectGlobalRoles: true,
 * })
 * ```
 *
 * Escape hatch: continue passando uma função própria em `resolveUser` quando precisar.
 */
export function lucidMirror(Model: LucidModelLike, options: LucidMirrorOptions = {}) {
  const idColumn = options.idColumn ?? 'id'
  return async (identity: Identity): Promise<unknown> => {
    const synced = options.sync ? options.sync(identity) : { email: identity.email }
    const user = await Model.updateOrCreate(
      { [idColumn]: identity.userId },
      { [idColumn]: identity.userId, ...synced }
    )

    if (options.preload) {
      for (const relation of options.preload) {
        await user.load(relation)
      }
    }

    if (options.injectGlobalRoles) {
      const prop =
        typeof options.injectGlobalRoles === 'string' ? options.injectGlobalRoles : 'globalRoles'
      user[prop] = identity.globalRoles ?? []
    }

    return user
  }
}
