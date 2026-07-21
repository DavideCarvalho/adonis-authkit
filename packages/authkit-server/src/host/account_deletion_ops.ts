import type { AuthAccount } from '../accounts/account_store.js';
import {
  supportsAccountDeletion,
  supportsMfa,
  supportsOrganizations,
  supportsPasskeys,
  supportsProviderIdentity,
} from '../accounts/account_store.js';
import type { ResolvedServerConfig } from '../define_config.js';
import type { OidcService } from '../provider/oidc_service.js';
import type { DeletionActor } from './account_deletion_service.js';
import { AdminSessionsService } from './admin_sessions_service.js';
import { deleteAvatar } from './avatar_storage.js';

/**
 * As 9 etapas do cascade de deleção de conta (LGPD/GDPR) extraídas em operações
 * DISCRETAS e IDEMPOTENTES. Cada uma é chamável individualmente — re-executar uma
 * etapa já concluída é um no-op seguro (o artefato já não existe / já está
 * anonimizado). Isto permite que:
 *
 *   - o {@link AccountDeletionService} síncrono as chame em sequência, na MESMA
 *     ordem e com a MESMA semântica best-effort de sempre (caminho inalterado);
 *   - o workflow durável (subpath `/durable`) envolva cada etapa em um `ctx.step`,
 *     ganhando retry por-etapa + resumabilidade SEM duplicar a lógica de negócio.
 *
 * Cada operação retorna o "delta" que produz; o caller acumula no
 * {@link DeletionResult}. Nenhuma operação lança em condições esperadas — o
 * tratamento best-effort (try/catch) é responsabilidade do caller, para manter o
 * comportamento síncrono byte-idêntico ao original.
 */

/** Snapshot mínimo da conta capturado ANTES da destruição (e-mail + avatar). */
export interface AccountSnapshot {
  id: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * Carrega o snapshot da conta. Retorna null se a conta não existe (ou já foi
 * deletada) — idempotente: re-executar após a deleção da linha devolve null.
 */
export async function snapshotAccount(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<AccountSnapshot | null> {
  const account = await cfg.accountStore.findById(accountId);
  if (!account) return null;
  return {
    id: account.id,
    email: account.email,
    avatarUrl: account.avatarUrl ?? null,
  };
}

/**
 * 1) Emite o audit `account.deleted` ANTES de qualquer destruição, com os
 * identificadores reais. Idempotente o suficiente: re-emitir registra uma segunda
 * linha (que também será anonimizada) — inofensivo para a trilha de auditoria.
 */
export async function auditDeleted(
  cfg: ResolvedServerConfig,
  snapshot: AccountSnapshot,
  actor: DeletionActor,
): Promise<void> {
  await cfg.audit?.record({
    type: 'account.deleted',
    accountId: snapshot.id,
    email: snapshot.email,
    actorId: actor.actorId,
    ip: actor.ip,
    metadata: { actor: actor.source },
  });
}

/** 2) Revoga TODAS as sessões + grants do oidc-provider (cascateia os tokens). */
export async function revokeSessions(
  oidc: OidcService,
  accountId: string,
): Promise<{
  sessions: number;
  grants: number;
  accessTokens: number;
  refreshTokens: number;
}> {
  const revoke = await new AdminSessionsService(oidc).revokeAll(accountId);
  return {
    sessions: revoke.sessions,
    grants: revoke.grants,
    accessTokens: revoke.accessTokens,
    refreshTokens: revoke.refreshTokens,
  };
}

/** 3) Revoga todos os Personal Access Tokens da conta (quando há patStore). */
export async function revokePats(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ pats: number }> {
  if (!cfg.patStore) return { pats: 0 };
  let pats = 0;
  const list = await cfg.patStore.listForAccount(accountId);
  for (const pat of list) {
    const ok = await cfg.patStore.revoke(accountId, pat.id);
    if (ok) pats++;
  }
  return { pats };
}

/** 4) Remove todas as passkeys / credenciais WebAuthn (capability-probed). */
export async function removePasskeys(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ passkeys: number }> {
  const store = cfg.accountStore;
  if (!supportsPasskeys(store)) return { passkeys: 0 };
  let passkeys = 0;
  const list = await store.listPasskeys(accountId);
  for (const pk of list) {
    await store.removePasskey(accountId, pk.id);
    passkeys++;
  }
  return { passkeys };
}

/** 5) Desliga o MFA (limpa segredo TOTP + recovery codes) (capability-probed). */
export async function disableMfa(cfg: ResolvedServerConfig, accountId: string): Promise<void> {
  const store = cfg.accountStore;
  if (!supportsMfa(store)) return;
  await store.disableMfa(accountId);
}

/** 6) Desliga as identidades de provider linkadas (capability-probed). */
export async function unlinkProviders(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ providerIdentities: number }> {
  const store = cfg.accountStore;
  if (!supportsProviderIdentity(store)) return { providerIdentities: 0 };
  const providerIdentities = await store.unlinkAllProviderIdentities(accountId);
  return { providerIdentities };
}

/** 6b) Remove memberships + convites de organizations (capability-probed). */
export async function removeFromOrgs(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ orgMemberships: number; orgInvitations: number }> {
  const store = cfg.accountStore;
  if (!supportsOrganizations(store)) return { orgMemberships: 0, orgInvitations: 0 };
  const orgResult = await store.removeAccountFromAllOrgs(accountId);
  return {
    orgMemberships: orgResult.memberships,
    orgInvitations: orgResult.invitations,
  };
}

/** 7) Apaga o avatar no backend ativo (drive OU media; best-effort, fail-safe). */
export async function deleteAccountAvatar(
  cfg: ResolvedServerConfig,
  accountId: string,
  avatarUrl: string | null,
): Promise<{ avatarDeleted: boolean }> {
  const avatarDeleted = await deleteAvatar(cfg.uploads, accountId, avatarUrl);
  return { avatarDeleted };
}

/** 8) Anonimiza o histórico de audit da conta (quando o sink suporta). */
export async function anonymizeAudit(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ auditAnonymized: number }> {
  if (cfg.audit && typeof cfg.audit.anonymizeAccount === 'function') {
    const auditAnonymized = await cfg.audit.anonymizeAccount(accountId);
    return { auditAnonymized };
  }
  return { auditAnonymized: 0 };
}

/**
 * 9) Deleta a linha da conta — a ÚLTIMA etapa (forward-only). Idempotente:
 * re-executar após a linha já ter sido deletada devolve `false` (sem efeito).
 */
export async function deleteAccountRow(
  cfg: ResolvedServerConfig,
  accountId: string,
): Promise<{ ok: boolean }> {
  const store = cfg.accountStore;
  if (!supportsAccountDeletion(store)) return { ok: false };
  const ok = await store.deleteAccount(accountId);
  return { ok };
}

/** Re-export do tipo usado pelos JSDoc acima, p/ conveniência dos consumidores. */
export type { AuthAccount };
