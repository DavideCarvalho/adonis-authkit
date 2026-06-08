import { lucidAccountStore, type LucidAccountStoreOptions } from './lucid_account_store.js'
import { lucidPatStore } from '../pat/lucid_pat_store.js'
import { lucidAuditSink } from '../audit/lucid_audit_sink.js'
import type { AccountStore } from './account_store.js'
import type { PatStore } from '../pat/pat_store.js'
import type { AuditSink } from '../audit/audit_sink.js'

/** Models Lucid (compostos dos mixins do authkit) para montar os stores de uma vez. */
export interface LucidStoresModels {
  /** Model de `withAuthUser()` (+withCredentials/+withMfa). Obrigatório. */
  account: any
  /** Model de `withPersonalAccessToken()` — habilita o patStore. */
  pat?: any
  /** Model de `withAuditLog()` — habilita o audit sink. */
  audit?: any
  /** Model de `withProviderIdentity()` — habilita account linking social. */
  providerIdentity?: any
  /** Model de `withWebauthnCredential()` — habilita passkeys. */
  webauthnCredential?: any
  /** Trio de models de organizations — habilita multi-tenancy. */
  organizations?: { OrgModel: any; MemberModel: any; InvitationModel: any }
}

export interface LucidStoresResult {
  accountStore: AccountStore
  patStore?: PatStore
  audit?: AuditSink
}

/** Options compartilhadas — os models vão em {@link LucidStoresModels}, não aqui. */
export type LucidStoresOptions = Omit<
  LucidAccountStoreOptions,
  'providerIdentityModel' | 'webauthnCredentialModel' | 'organizationModels'
>

/**
 * Conveniência que monta `accountStore` (+ `patStore` + `audit`) a partir dos models,
 * declarando `mfaIssuer`/`webauthn`/`encrypter` UMA vez. Substitui o wiring repetido
 * de 5–8 models passados um a um no `config/authkit.ts`.
 *
 * ```ts
 * const { accountStore, patStore, audit } = lucidStores(
 *   { account: AuthUser, pat: PersonalAccessToken, audit: AuditLog,
 *     providerIdentity: ProviderIdentity, webauthnCredential: WebauthnCredential,
 *     organizations: { OrgModel: Organization, MemberModel: OrganizationMember, InvitationModel: OrganizationInvitation } },
 *   { mfaIssuer: 'educ(a)ção', webauthn }
 * )
 * ```
 */
export function lucidStores(
  models: LucidStoresModels,
  options: LucidStoresOptions = {}
): LucidStoresResult {
  const accountStore = lucidAccountStore(models.account, {
    ...options,
    providerIdentityModel: models.providerIdentity,
    webauthnCredentialModel: models.webauthnCredential,
    organizationModels: models.organizations,
  })
  return {
    accountStore,
    ...(models.pat ? { patStore: lucidPatStore(models.pat) } : {}),
    ...(models.audit ? { audit: lucidAuditSink(models.audit) } : {}),
  }
}
