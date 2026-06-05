import type { OidcService } from '../provider/oidc_service.js'
import type { ResolvedServerConfig } from '../define_config.js'
import {
  supportsAccountDeletion,
  supportsMfa,
  supportsOrganizations,
  supportsPasskeys,
  supportsProviderIdentity,
} from '../accounts/account_store.js'
import { AdminSessionsService } from './admin_sessions_service.js'
import { deleteAvatar } from './avatar_storage.js'

/** Quem disparou a deleção (auditoria). 'self' = o próprio usuário; senão admin. */
export interface DeletionActor {
  /** Id de quem agiu: o próprio user (self-service) ou o admin. null para admin-api. */
  actorId: string | null
  /** IP da request, quando disponível. */
  ip: string | null
  /**
   * Origem da deleção (vai no metadata do audit):
   *   - 'self'      → o próprio usuário no console de conta;
   *   - 'admin'     → um admin pelo console HTML;
   *   - 'admin-api' → via Admin REST API / SDK.
   */
  source: 'self' | 'admin' | 'admin-api'
}

/** Contagens do que foi removido no cascade (para auditoria/diagnóstico). */
export interface DeletionResult {
  ok: boolean
  sessions: number
  grants: number
  accessTokens: number
  refreshTokens: number
  pats: number
  passkeys: number
  providerIdentities: number
  /** Linhas de audit anonimizadas (não deletadas). */
  auditAnonymized: number
  /** Avatar removido do drive (best-effort). */
  avatarDeleted: boolean
  /** Memberships em organizations removidas. */
  orgMemberships: number
  /** Convites pendentes de organizations removidos. */
  orgInvitations: number
}

/**
 * Orquestra a deleção COMPLETA de uma conta (LGPD/GDPR — "direito ao
 * esquecimento"), compartilhada entre o self-service (console de conta) e o admin
 * (console HTML + Admin REST API + SDK embedded). O cascade, na ordem:
 *
 *   1. emite o audit `account.deleted` ANTES de qualquer destruição (com o ator
 *      correto), para que o evento exista com os identificadores reais;
 *   2. revoga TODAS as sessões + grants do oidc-provider (cascateia os tokens);
 *   3. revoga todos os Personal Access Tokens da conta (quando há patStore);
 *   4. remove todas as passkeys / credenciais WebAuthn (capability-probed);
 *   5. desliga o MFA (limpa segredo TOTP + recovery codes) (capability-probed);
 *   6. desliga as identidades de provider linkadas (capability-probed);
 *   7. apaga o avatar no drive (best-effort, fail-safe);
 *   8. ANONIMIZA o histórico de audit da conta (mantém as linhas, remove os
 *      identificadores pessoais) — só quando o sink suporta `anonymizeAccount`;
 *   9. deleta a linha da conta (capability-probed: {@link AccountDeletionCapability}).
 *
 * Capability-probed: se o store não suporta delete, `delete()` retorna
 * `{ ok: false }` e nada é destruído (a UI/admin não deve sequer oferecer a ação).
 * Cada etapa é isolada (best-effort) — uma falha não impede as demais nem a
 * destruição final da conta.
 */
export class AccountDeletionService {
  #cfg: ResolvedServerConfig
  #oidc: OidcService

  constructor(oidc: OidcService) {
    this.#oidc = oidc
    this.#cfg = oidc.config
  }

  /** Indica se a deleção está disponível (o store suporta hard delete). */
  get canDelete(): boolean {
    return supportsAccountDeletion(this.#cfg.accountStore)
  }

  async delete(accountId: string, actor: DeletionActor): Promise<DeletionResult> {
    const cfg = this.#cfg
    const store = cfg.accountStore
    const result: DeletionResult = {
      ok: false,
      sessions: 0,
      grants: 0,
      accessTokens: 0,
      refreshTokens: 0,
      pats: 0,
      passkeys: 0,
      providerIdentities: 0,
      auditAnonymized: 0,
      avatarDeleted: false,
      orgMemberships: 0,
      orgInvitations: 0,
    }

    if (!supportsAccountDeletion(store)) return result

    // Snapshot da conta ANTES de destruir (precisamos do e-mail/avatar p/ audit + drive).
    const account = await store.findById(accountId)
    if (!account) return result

    // 1) Audit `account.deleted` ANTES de anonimizar/destruir — registra com os
    // identificadores reais (a anonimização posterior cuidará desta linha também).
    await cfg.audit?.record({
      type: 'account.deleted',
      accountId,
      email: account.email,
      actorId: actor.actorId,
      ip: actor.ip,
      metadata: { actor: actor.source },
    })

    // 2) Sessões + grants (cascateia os tokens do oidc-provider).
    try {
      const revoke = await new AdminSessionsService(this.#oidc).revokeAll(accountId)
      result.sessions = revoke.sessions
      result.grants = revoke.grants
      result.accessTokens = revoke.accessTokens
      result.refreshTokens = revoke.refreshTokens
    } catch {
      // best-effort: a destruição da conta segue mesmo se a enumeração falhar.
    }

    // 3) Personal Access Tokens.
    if (cfg.patStore) {
      try {
        const pats = await cfg.patStore.listForAccount(accountId)
        for (const pat of pats) {
          const ok = await cfg.patStore.revoke(accountId, pat.id)
          if (ok) result.pats++
        }
      } catch {
        /* best-effort */
      }
    }

    // 4) Passkeys / credenciais WebAuthn.
    if (supportsPasskeys(store)) {
      try {
        const passkeys = await store.listPasskeys(accountId)
        for (const pk of passkeys) {
          await store.removePasskey(accountId, pk.id)
          result.passkeys++
        }
      } catch {
        /* best-effort */
      }
    }

    // 5) MFA / TOTP (segredo + recovery codes).
    if (supportsMfa(store)) {
      try {
        await store.disableMfa(accountId)
      } catch {
        /* best-effort */
      }
    }

    // 6) Identidades de provider linkadas (Google, GitHub, …).
    if (supportsProviderIdentity(store)) {
      try {
        result.providerIdentities = await store.unlinkAllProviderIdentities(accountId)
      } catch {
        /* best-effort */
      }
    }

    // 6b) Organizations: remove memberships + convites da conta (best-effort).
    // Nota: se a conta é o ÚNICO owner de uma org, a org fica sem owner e isso é
    // documentado no JSDoc — a deleção NUNCA é bloqueada por LGPD/GDPR.
    if (supportsOrganizations(store)) {
      try {
        const orgResult = await store.removeAccountFromAllOrgs(accountId)
        result.orgMemberships = orgResult.memberships
        result.orgInvitations = orgResult.invitations
      } catch {
        /* best-effort */
      }
    }

    // 7) Avatar no drive (best-effort, fail-safe).
    try {
      result.avatarDeleted = await deleteAvatar(cfg.uploads, account.avatarUrl)
    } catch {
      /* best-effort */
    }

    // 8) Anonimiza o histórico de audit (mantém as linhas, remove identificadores).
    if (cfg.audit && typeof cfg.audit.anonymizeAccount === 'function') {
      try {
        result.auditAnonymized = await cfg.audit.anonymizeAccount(accountId)
      } catch {
        /* best-effort */
      }
    }

    // 9) Deleta a linha da conta.
    result.ok = await store.deleteAccount(accountId)
    return result
  }
}
