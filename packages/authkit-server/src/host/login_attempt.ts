import type { AuthAccount } from '../accounts/account_store.js';
import {
  supportsAccountStatus,
  supportsEmailVerificationStatus,
  supportsPasswordExpiration,
} from '../accounts/account_store.js';
import type { AuditSink } from '../audit/audit_sink.js';
import type { ResolvedServerConfig } from '../define_config.js';
import { createAccountLockout } from './account_lockout.js';
import type { SettingsCapability } from './runtime_settings.js';
import {
  resolveEffectiveAccountExpiration,
  resolveEffectiveLockout,
  resolveEffectivePasswordExpiration,
  resolveEffectiveRequireVerifiedEmail,
  resolveEffectiveRequireVerifiedEmailFull,
} from './runtime_toggles.js';

/**
 * `requireVerifiedEmail` efetivo (config ou runtime setting) E o store sabe dizer
 * se o e-mail está verificado E a conta NÃO está verificada → bloqueia.
 * Capability-probed: sem {@link EmailVerificationStatusCapability} a checagem é
 * no-op (não bloqueia). Compartilhado pelos três fluxos de login (senha, magic
 * link, passkey-first).
 *
 * Suporta `graceDays`: se a conta foi criada há menos de `graceDays` dias e ainda
 * não verificou o e-mail, o login é permitido (mas a UI mostra um banner avisando).
 *
 * @param settings - SettingsCapability para ler o runtime setting. Quando
 *   ausente (chamadores que ainda não injetam o settings), faz fallback ao config.
 */
export async function isEmailUnverifiedBlock(
  cfg: ResolvedServerConfig,
  accountId: string,
  settings?: SettingsCapability,
): Promise<boolean> {
  // Resolve o valor efetivo: runtime setting sobrescreve o config estático.
  const requireVerified = settings
    ? await resolveEffectiveRequireVerifiedEmail(cfg.login?.requireVerifiedEmail ?? false, settings)
    : (cfg.login?.requireVerifiedEmail ?? false);

  if (!requireVerified) return false;
  if (!supportsEmailVerificationStatus(cfg.accountStore)) return false;
  const verified = await cfg.accountStore.isEmailVerified(accountId);
  if (verified) return false;

  // Grace period: se a setting tem graceDays e a conta foi criada recentemente,
  // permite o login.
  if (settings) {
    const full = await resolveEffectiveRequireVerifiedEmailFull(
      cfg.login?.requireVerifiedEmail ?? false,
      settings,
    );
    if (full.graceDays > 0) {
      // Busca a conta para checar created_at (se o store suportar).
      const account = await cfg.accountStore.findById(accountId);
      if (account) {
        // Tenta ler `created_at` via duck-typing (não é parte do contrato AccountStore).
        const raw = account as any;
        const createdAt: Date | null =
          raw.createdAt instanceof Date
            ? raw.createdAt
            : typeof raw.createdAt === 'string'
              ? new Date(raw.createdAt)
              : null;
        if (createdAt) {
          const graceCutoff = new Date(createdAt.getTime() + full.graceDays * 24 * 60 * 60 * 1000);
          if (new Date() <= graceCutoff) {
            return false; // dentro da janela de graça → não bloqueia
          }
        }
      }
    }
  }

  return true;
}

/**
 * Verifica se a senha da conta está vencida (password expiration).
 * Capability-probed: sem `getPasswordChangedAt` → retorna false.
 * Quando `password_expiration.enabled` é false ou a coluna não existe → false.
 *
 * @returns true se a senha expirou e deve ser trocada antes de completar o login.
 */
export async function isPasswordExpired(
  cfg: ResolvedServerConfig,
  accountId: string,
  settings: SettingsCapability,
): Promise<boolean> {
  const expiration = await resolveEffectivePasswordExpiration(settings);
  if (!expiration.enabled) return false;
  if (!supportsPasswordExpiration(cfg.accountStore)) return false;

  const changedAt = await cfg.accountStore.getPasswordChangedAt!(accountId);
  if (!changedAt) {
    // Senha nunca trocada (coluna NULL = conta legacy) → considera vencida quando
    // expiration está ligada (seguro: força a troca na 1ª vez).
    return true;
  }

  const maxAgeMs = expiration.maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - changedAt.getTime() > maxAgeMs;
}

/**
 * Verifica se a conta está expirada por inatividade (account_expiration setting).
 *
 * "Última atividade" = timestamp do último `login.success` da conta no audit.
 * Capability-probed: sem `audit.list` → retorna false (feature indisponível).
 * Quando enabled=false ou sem audit queryável → false (no-op).
 *
 * @param audit - AuditSink. Quando ausente ou sem `list`, retorna false.
 * @param accountId - ID da conta a verificar.
 * @param settings - SettingsCapability para ler a setting `account_expiration`.
 * @param logger - logger mínimo opcional. Quando presente, registra falhas de DB
 *   no caminho fail-safe (sem ele, o erro continua silencioso por compat).
 * @returns true se a conta está expirada e o login deve ser bloqueado.
 */
export async function isAccountExpired(
  audit: AuditSink | null | undefined,
  accountId: string,
  settings: SettingsCapability,
  logger?: LoginAttemptLogger,
): Promise<boolean> {
  const expiration = await resolveEffectiveAccountExpiration(settings);
  if (!expiration.enabled) return false;
  // Sem audit queryável → feature indisponível → não bloqueia.
  if (typeof audit?.list !== 'function') return false;

  try {
    // Busca o último login.success da conta (ordem desc, limit 1).
    const result = await audit.list({
      type: 'login.success',
      subject: accountId,
      page: 1,
      limit: 1,
    });
    if (result.data.length === 0) {
      // Nunca logou → considera ativa (conta nova, não inativa).
      return false;
    }
    const lastLogin = result.data[0];
    const createdAt = lastLogin.createdAt;
    if (!createdAt) return false;
    const lastMs =
      createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt as string);
    if (!Number.isFinite(lastMs)) return false;
    const cutoffMs = Date.now() - expiration.inactiveDays * 24 * 60 * 60 * 1000;
    return lastMs < cutoffMs;
  } catch (err) {
    // Fail-safe: erro de DB → não bloqueia. Loga: enquanto a query de audit estiver
    // quebrada, a expiração por inatividade não é aplicada (admin precisa saber).
    logger?.warn(
      { err, accountId },
      'authkit: account-expiration check failed (audit query error) — not blocking login (fail-safe); inactivity enforcement is disabled until the audit store recovers.',
    );
    return false;
  }
}

/** Logger mínimo (subconjunto do logger do AdonisJS) para o caminho fail-safe. */
export interface LoginAttemptLogger {
  warn(obj: unknown, msg?: string): void;
}

/** Entrada de uma tentativa de login por senha (keyed por email). */
export interface PasswordLoginInput {
  email: string;
  password: string;
  /** IP da request (para auditoria + lockout). null quando indisponível. */
  ip: string | null;
  /**
   * client_id da interaction OIDC, quando existir. Só é incluído no evento de
   * auditoria nos fluxos que o têm (interaction); ausente no console de conta.
   */
  clientId?: string | null;
  /**
   * SettingsCapability para ler o runtime setting de `require_verified_email`.
   * Quando ausente, faz fallback ao valor de `cfg.login.requireVerifiedEmail`.
   */
  settings?: SettingsCapability;
  /**
   * Logger mínimo opcional. Repassado aos caminhos fail-safe (ex.: checagem de
   * expiração por inatividade) para que falhas de infra não fiquem silenciosas.
   */
  logger?: LoginAttemptLogger;
}

/** Resultado de {@link attemptPasswordLogin}. */
export type PasswordLoginResult =
  | { ok: true; account: AuthAccount }
  | {
      ok: false;
      locked: boolean;
      retryAfterSec?: number;
      disabled?: boolean;
      unverified?: boolean;
      unverifiedGraceDays?: number;
      passwordExpired?: boolean;
      accountExpired?: boolean;
      account?: AuthAccount;
    };

/**
 * Sequência canônica de login por senha + bloqueio progressivo, compartilhada
 * pelos dois fluxos que pedem senha (interaction OIDC e console de conta):
 *
 *   1. `lockout.isLocked(email)` — se travada, NÃO verifica a senha; devolve
 *      `{ ok: false, locked: true, retryAfterSec }` (o controller renderiza o erro).
 *   2. `verifyCredentials(email, password)` — em falha: emite `login.failure`
 *      (com `clientId` apenas quando fornecido), registra a falha no lockout
 *      (`{ sink: cfg.audit, ip }`) e devolve `{ ok: false, locked: false }`.
 *   3. Em sucesso: limpa o contador de falhas e devolve `{ ok: true, account }`.
 *
 * O evento `login.success` e a finalização da sessão/interaction ficam a cargo de
 * cada controller (os fluxos diferem: MFA gate na interaction, sessão no console),
 * assim como toda a renderização.
 */
export async function attemptPasswordLogin(
  cfg: ResolvedServerConfig,
  input: PasswordLoginInput,
): Promise<PasswordLoginResult> {
  const { email, password, ip } = input;
  // Lockout efetivo: runtime setting `lockout` sobrescreve o config estático.
  // FAIL-SAFE → cfg.lockout (resolveEffectiveLockout já trata erros internamente).
  // `store` é infra e permanece no config estático (não vem da setting).
  const effectiveLockout = input.settings
    ? { ...(await resolveEffectiveLockout(input.settings, cfg.lockout)), store: cfg.lockout.store }
    : cfg.lockout;
  const lockout = createAccountLockout(effectiveLockout);

  // Bloqueio progressivo (keyed por email): se travada, não verifica a senha.
  const lock = await lockout.isLocked(email);
  if (lock.locked) {
    return { ok: false, locked: true, retryAfterSec: lock.retryAfterSec };
  }

  const account = await cfg.accountStore.verifyCredentials(email, password);
  if (!account) {
    // `clientId` só entra no evento quando o fluxo o fornece (interaction).
    await cfg.audit?.record(
      input.clientId !== undefined
        ? { type: 'login.failure', email, ip, clientId: input.clientId }
        : { type: 'login.failure', email, ip },
    );
    await lockout.recordFailure(email, { sink: cfg.audit, ip });
    return { ok: false, locked: false };
  }

  // Conta desabilitada: rejeita o login (mesmo com senha correta). A capacidade é
  // opcional — só checada quando o store a implementa. Emite `login.failure` (com
  // motivo `disabled` no metadata) e NÃO registra falha no lockout (não é tentativa
  // de adivinhar senha).
  if (supportsAccountStatus(cfg.accountStore) && (await cfg.accountStore.isDisabled(account.id))) {
    await cfg.audit?.record(
      input.clientId !== undefined
        ? {
            type: 'login.failure',
            email,
            ip,
            clientId: input.clientId,
            metadata: { reason: 'disabled' },
          }
        : { type: 'login.failure', email, ip, metadata: { reason: 'disabled' } },
    );
    return { ok: false, locked: false, disabled: true };
  }

  // E-mail não verificado (LGPD/compliance): rejeita o login se a política exige
  // verificação E o store sabe responder. Não conta como falha de senha (a senha
  // estava correta) — limpa o contador e emite login.failure com motivo `unverified`.
  if (await isEmailUnverifiedBlock(cfg, account.id, input.settings)) {
    await lockout.clearFailures(email);
    await cfg.audit?.record(
      input.clientId !== undefined
        ? {
            type: 'login.failure',
            email,
            ip,
            clientId: input.clientId,
            metadata: { reason: 'unverified' },
          }
        : { type: 'login.failure', email, ip, metadata: { reason: 'unverified' } },
    );
    return { ok: false, locked: false, unverified: true };
  }

  // Senha expirada (password expiration): se a senha está vencida, sinaliza ao
  // controller para forçar a troca ANTES de completar o login.
  // Capability-probed: sem `getPasswordChangedAt` ou sem a setting → no-op.
  if (input.settings) {
    const expired = await isPasswordExpired(cfg, account.id, input.settings);
    if (expired) {
      // Não é uma falha de credenciais — limpa o contador.
      await lockout.clearFailures(email);
      await cfg.audit?.record(
        input.clientId !== undefined
          ? {
              type: 'password.expired_change_forced',
              accountId: account.id,
              email,
              ip,
              clientId: input.clientId,
            }
          : { type: 'password.expired_change_forced', accountId: account.id, email, ip },
      );
      return { ok: false, locked: false, passwordExpired: true, account: account as any };
    }
  }

  // Conta expirada por inatividade (account_expiration setting): bloqueia o login
  // se a conta não teve login.success há mais de `inactiveDays` dias (via audit).
  // Capability-probed: sem audit.list ou sem setting → no-op.
  // Reativação: fluxo de reset de senha (link exibido pelo controller na mensagem).
  if (input.settings) {
    const expired = await isAccountExpired(cfg.audit, account.id, input.settings, input.logger);
    if (expired) {
      await lockout.clearFailures(email);
      await cfg.audit?.record(
        input.clientId !== undefined
          ? {
              type: 'account.expired_login_blocked',
              accountId: account.id,
              email,
              ip,
              clientId: input.clientId,
            }
          : { type: 'account.expired_login_blocked', accountId: account.id, email, ip },
      );
      return { ok: false, locked: false, accountExpired: true };
    }
  }

  // Senha correta: limpa o contador de falhas (o lockout protege a etapa de senha).
  await lockout.clearFailures(email);
  return { ok: true, account };
}
