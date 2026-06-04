import type { LinkProviderIdentityInput, ProviderIdentityCapability } from '../account_store.js'
import type { LucidStoreContext } from './shared.js'

/**
 * Capacidade de account linking por identidade de provider (Google, GitHub, …).
 * Só é montada quando o `providerIdentityModel` é fornecido — quando ausente, a
 * capacidade inteira fica ABSENTE do store (sem método presente-mas-lançando).
 */
export function buildProviderIdentity(
  ctx: LucidStoreContext,
  ProviderIdentityModel: any
): ProviderIdentityCapability {
  const { Model, toAccount } = ctx

  return {
    async findByProviderIdentity(provider, providerUserId) {
      const identity = await ProviderIdentityModel.query()
        .where('provider', provider)
        .where('providerUserId', providerUserId)
        .first()
      if (!identity) return null
      const row = await Model.find(identity.accountId)
      return row ? toAccount(row) : null
    },

    async linkProviderIdentity(data: LinkProviderIdentityInput) {
      // Upsert idempotente na chave única (provider, providerUserId): atualiza
      // account/email se já existir, cria caso contrário.
      const existing = await ProviderIdentityModel.query()
        .where('provider', data.provider)
        .where('providerUserId', data.providerUserId)
        .first()
      if (existing) {
        existing.accountId = data.accountId
        if (data.email !== undefined) existing.email = data.email
        await existing.save()
        return
      }
      await ProviderIdentityModel.create({
        provider: data.provider,
        providerUserId: data.providerUserId,
        accountId: data.accountId,
        email: data.email ?? null,
      })
    },
  }
}
