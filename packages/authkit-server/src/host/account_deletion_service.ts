import type { OidcService } from "../provider/oidc_service.js";
import type { ResolvedServerConfig } from "../define_config.js";
import { supportsAccountDeletion } from "../accounts/account_store.js";
import {
  anonymizeAudit,
  auditDeleted,
  deleteAccountAvatar,
  deleteAccountRow,
  disableMfa,
  removeFromOrgs,
  removePasskeys,
  revokePats,
  revokeSessions,
  snapshotAccount,
  unlinkProviders,
} from "./account_deletion_ops.js";

/** Quem disparou a deleção (auditoria). 'self' = o próprio usuário; senão admin. */
export interface DeletionActor {
  /** Id de quem agiu: o próprio user (self-service) ou o admin. null para admin-api. */
  actorId: string | null;
  /** IP da request, quando disponível. */
  ip: string | null;
  /**
   * Origem da deleção (vai no metadata do audit):
   *   - 'self'      → o próprio usuário no console de conta;
   *   - 'admin'     → um admin pelo console HTML;
   *   - 'admin-api' → via Admin REST API / SDK.
   */
  source: "self" | "admin" | "admin-api";
}

/** Contagens do que foi removido no cascade (para auditoria/diagnóstico). */
export interface DeletionResult {
  ok: boolean;
  sessions: number;
  grants: number;
  accessTokens: number;
  refreshTokens: number;
  pats: number;
  passkeys: number;
  providerIdentities: number;
  /** Linhas de audit anonimizadas (não deletadas). */
  auditAnonymized: number;
  /** Avatar removido do drive (best-effort). */
  avatarDeleted: boolean;
  /** Memberships em organizations removidas. */
  orgMemberships: number;
  /** Convites pendentes de organizations removidos. */
  orgInvitations: number;
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
  #cfg: ResolvedServerConfig;
  #oidc: OidcService;

  constructor(oidc: OidcService) {
    this.#oidc = oidc;
    this.#cfg = oidc.config;
  }

  /** Indica se a deleção está disponível (o store suporta hard delete). */
  get canDelete(): boolean {
    return supportsAccountDeletion(this.#cfg.accountStore);
  }

  async delete(
    accountId: string,
    actor: DeletionActor,
  ): Promise<DeletionResult> {
    const cfg = this.#cfg;
    const store = cfg.accountStore;
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
    };

    if (!supportsAccountDeletion(store)) return result;

    // Snapshot da conta ANTES de destruir (precisamos do e-mail/avatar p/ audit + drive).
    const snapshot = await snapshotAccount(cfg, accountId);
    if (!snapshot) return result;

    // O cascade chama as MESMAS operações idempotentes do `account_deletion_ops`,
    // na MESMA ordem e com a MESMA semântica best-effort (cada etapa isolada). O
    // workflow durável (subpath `/durable`) envolve estas operações em `ctx.step`.

    // 1) Audit `account.deleted` ANTES de anonimizar/destruir — registra com os
    // identificadores reais (a anonimização posterior cuidará desta linha também).
    await auditDeleted(cfg, snapshot, actor);

    // 2) Sessões + grants (cascateia os tokens do oidc-provider).
    try {
      const revoke = await revokeSessions(this.#oidc, accountId);
      result.sessions = revoke.sessions;
      result.grants = revoke.grants;
      result.accessTokens = revoke.accessTokens;
      result.refreshTokens = revoke.refreshTokens;
    } catch {
      // best-effort: a destruição da conta segue mesmo se a enumeração falhar.
    }

    // 3) Personal Access Tokens.
    try {
      result.pats = (await revokePats(cfg, accountId)).pats;
    } catch {
      /* best-effort */
    }

    // 4) Passkeys / credenciais WebAuthn.
    try {
      result.passkeys = (await removePasskeys(cfg, accountId)).passkeys;
    } catch {
      /* best-effort */
    }

    // 5) MFA / TOTP (segredo + recovery codes).
    try {
      await disableMfa(cfg, accountId);
    } catch {
      /* best-effort */
    }

    // 6) Identidades de provider linkadas (Google, GitHub, …).
    try {
      result.providerIdentities = (
        await unlinkProviders(cfg, accountId)
      ).providerIdentities;
    } catch {
      /* best-effort */
    }

    // 6b) Organizations: remove memberships + convites da conta (best-effort).
    // Nota: se a conta é o ÚNICO owner de uma org, a org fica sem owner e isso é
    // documentado no JSDoc — a deleção NUNCA é bloqueada por LGPD/GDPR.
    try {
      const orgResult = await removeFromOrgs(cfg, accountId);
      result.orgMemberships = orgResult.orgMemberships;
      result.orgInvitations = orgResult.orgInvitations;
    } catch {
      /* best-effort */
    }

    // 7) Avatar no drive (best-effort, fail-safe).
    try {
      result.avatarDeleted = (
        await deleteAccountAvatar(cfg, snapshot.avatarUrl)
      ).avatarDeleted;
    } catch {
      /* best-effort */
    }

    // 8) Anonimiza o histórico de audit (mantém as linhas, remove identificadores).
    try {
      result.auditAnonymized = (
        await anonymizeAudit(cfg, accountId)
      ).auditAnonymized;
    } catch {
      /* best-effort */
    }

    // 9) Deleta a linha da conta.
    result.ok = (await deleteAccountRow(cfg, accountId)).ok;
    return result;
  }
}
