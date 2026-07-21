/**
 * OTP Lockout — trava o fator TOTP/recovery após N falhas consecutivas.
 *
 * Implementação paralela ao account_lockout.ts, mas keyed por accountId (não por
 * e-mail) e limitando o FATOR (não a conta inteira). Usa a mesma infraestrutura do
 * `@adonisjs/limiter` (peer/opt-in, fail-safe).
 *
 * Esquema de chaves (namespaced por accountId):
 *   `authkit_otp_fail:<accountId>`    — contador de falhas TOTP/recovery.
 *   `authkit_otp_lock:<accountId>`    — flag de travamento do fator OTP.
 *
 * Storage do token de desbloqueio: prefixo `ou:` no campo `passwordResetToken`
 * do model do usuário (mesma abordagem de magic link `ml:` e email change `ec:`).
 * Sem migração necessária — reutiliza coluna existente.
 *
 * No-op total quando o `@adonisjs/limiter` não está instalado.
 */

import { createHash, randomBytes } from 'node:crypto';
import type { AuditSink } from '../audit/audit_sink.js';
import type { SettingsCapability } from './runtime_settings.js';
import { SETTING_KEYS } from './runtime_toggles.js';

// ---------------------------------------------------------------------------
// Setting shape
// ---------------------------------------------------------------------------

export interface OtpLockoutSetting {
  enabled?: boolean;
  maxAttempts?: number;
  unlockTtlHours?: number;
}

export interface ResolvedOtpLockoutSetting {
  enabled: boolean;
  maxAttempts: number;
  unlockTtlHours: number;
}

export const OTP_LOCKOUT_DEFAULTS: ResolvedOtpLockoutSetting = {
  enabled: true,
  maxAttempts: 5,
  unlockTtlHours: 24,
};

/**
 * Resolve a setting `otp_lockout` em runtime (fail-safe).
 */
export async function resolveEffectiveOtpLockout(
  settings: SettingsCapability,
): Promise<ResolvedOtpLockoutSetting> {
  try {
    const raw = await settings.getSetting(SETTING_KEYS.OTP_LOCKOUT);
    if (raw === null || raw === undefined) return OTP_LOCKOUT_DEFAULTS;
    if (typeof raw !== 'object' || Array.isArray(raw)) return OTP_LOCKOUT_DEFAULTS;
    const s = raw as OtpLockoutSetting;
    return {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : OTP_LOCKOUT_DEFAULTS.enabled,
      maxAttempts:
        typeof s.maxAttempts === 'number' && s.maxAttempts >= 1
          ? Math.floor(s.maxAttempts)
          : OTP_LOCKOUT_DEFAULTS.maxAttempts,
      unlockTtlHours:
        typeof s.unlockTtlHours === 'number' && s.unlockTtlHours >= 1
          ? Math.floor(s.unlockTtlHours)
          : OTP_LOCKOUT_DEFAULTS.unlockTtlHours,
    };
  } catch {
    return OTP_LOCKOUT_DEFAULTS;
  }
}

// ---------------------------------------------------------------------------
// Token de desbloqueio (OTP unlock)
// ---------------------------------------------------------------------------

/** Prefixo do token de desbloqueio OTP no campo passwordResetToken. */
export const OTP_UNLOCK_TOKEN_PREFIX = 'ou:';

/**
 * Gera um token de desbloqueio OTP para armazenar no model do usuário.
 * O token bruto vai no e-mail; o hash SHA-256 fica no DB (mesmo padrão
 * de email_change e reset de senha).
 *
 * @returns `{ raw, prefix }` — `raw` vai na URL; `prefix + sha256(raw)` no DB.
 */
export function generateOtpUnlockToken(): { raw: string; dbValue: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, dbValue: `${OTP_UNLOCK_TOKEN_PREFIX}${hash}` };
}

/**
 * Converte um token bruto recebido na URL no valor de DB correspondente.
 */
export function rawToDbOtpUnlockToken(raw: string): string {
  const hash = createHash('sha256').update(raw).digest('hex');
  return `${OTP_UNLOCK_TOKEN_PREFIX}${hash}`;
}

// ---------------------------------------------------------------------------
// Limiter (lazy, fail-safe — mesmo padrão do account_lockout)
// ---------------------------------------------------------------------------

type LimiterService = any;
let limiterPromise: Promise<LimiterService | null> | undefined;

async function loadLimiter(): Promise<LimiterService | null> {
  if (!limiterPromise) {
    const spec = '@adonisjs/limiter/services/main';
    limiterPromise = import(spec).then((m) => (m as any).default ?? null).catch(() => null);
  }
  return limiterPromise;
}

/** Reaponta o loader (usado em testes). @internal */
export function __setOtpLockoutLimiterLoaderForTests(
  fn: (() => Promise<LimiterService | null>) | undefined,
): void {
  if (fn) {
    limiterPromise = fn();
  } else {
    limiterPromise = undefined;
  }
}

// ---------------------------------------------------------------------------
// OtpLockout helper
// ---------------------------------------------------------------------------

export interface OtpLockoutAuditContext {
  sink?: AuditSink;
  ip?: string | null;
}

/**
 * Logger mínimo (subconjunto do logger do AdonisJS) para observar as degradações
 * fail-safe. Sem ele, os caminhos de erro continuam silenciosos (backward-compat).
 */
export interface OtpLockoutLogger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Gerencia o lockout do fator OTP (TOTP + recovery) por accountId.
 * No-op quando o limiter não está disponível.
 */
export class OtpLockout {
  constructor(
    private cfg: ResolvedOtpLockoutSetting,
    private logger?: OtpLockoutLogger,
  ) {}

  private failKey(accountId: string) {
    return `authkit_otp_fail:${accountId}`;
  }
  private lockKey(accountId: string) {
    return `authkit_otp_lock:${accountId}`;
  }

  private async limiter(): Promise<LimiterService | null> {
    if (!this.cfg.enabled) return null;
    return loadLimiter();
  }

  /** Store de contagem de falhas (janela = unlockTtlHours * 2 s). */
  private failStore(l: LimiterService) {
    const opts = { requests: this.cfg.maxAttempts, duration: this.cfg.unlockTtlHours * 3600 * 2 };
    return l.use(opts);
  }

  /** Store da flag de lock (requests=1, duration=unlockTtlHours). */
  private lockStore(l: LimiterService) {
    const opts = { requests: 1, duration: this.cfg.unlockTtlHours * 3600 };
    return l.use(opts);
  }

  /**
   * Verifica se o fator OTP está travado para a conta.
   * FAIL-SAFE: erro → `false` (nunca bloqueia por falha de infra).
   */
  async isLocked(accountId: string): Promise<boolean> {
    const l = await this.limiter();
    if (!l || !accountId) return false;
    try {
      return await this.lockStore(l).isBlocked(this.lockKey(accountId));
    } catch (err) {
      // Falha do limiter NUNCA derruba o login — degrada para "não travado". Mas
      // loga: enquanto o limiter estiver quebrado, o lockout de OTP fica desligado.
      this.logger?.warn(
        { err, accountId },
        'authkit: OTP lockout isLocked check failed (limiter error) — degrading to unlocked (fail-safe); OTP lockout is effectively disabled until the limiter recovers.',
      );
      return false;
    }
  }

  /**
   * Registra uma falha de TOTP/recovery. Ao atingir maxAttempts, trava o fator.
   * Emite `otp.locked` no audit (uma vez, na transição).
   * FAIL-SAFE: erros do limiter nunca propagam.
   */
  async recordFailure(accountId: string, audit?: OtpLockoutAuditContext): Promise<boolean> {
    const l = await this.limiter();
    if (!l || !accountId) return false;
    try {
      // Se já está travado, não conta de novo.
      if (await this.lockStore(l).isBlocked(this.lockKey(accountId))) return true;

      const failStore = this.failStore(l);
      const res = await failStore.increment(this.failKey(accountId));
      const consumed = res?.consumed ?? 0;
      if (consumed < this.cfg.maxAttempts) return false;

      // Transição para travado.
      await this.lockStore(l).block(this.lockKey(accountId), this.cfg.unlockTtlHours * 3600);
      await failStore.delete(this.failKey(accountId));

      await audit?.sink?.record({
        type: 'otp.locked',
        accountId,
        ip: audit?.ip ?? null,
        metadata: { maxAttempts: this.cfg.maxAttempts },
      });
      return true;
    } catch (err) {
      // Falha do limiter ao registrar a tentativa: a falha NÃO é contabilizada, o
      // que enfraquece a proteção anti-brute-force do fator OTP. Nunca propaga (o
      // login não pode quebrar por infra), mas loga para não ficar invisível.
      this.logger?.warn(
        { err, accountId },
        'authkit: OTP lockout recordFailure failed (limiter error) — failure NOT counted; brute-force protection on the OTP factor is degraded until the limiter recovers.',
      );
      return false;
    }
  }

  /**
   * Limpa o estado de falhas OTP após um código correto.
   * FAIL-SAFE: erros do limiter nunca propagam.
   */
  async clearFailures(accountId: string): Promise<void> {
    const l = await this.limiter();
    if (!l || !accountId) return;
    try {
      await this.failStore(l).delete(this.failKey(accountId));
    } catch {
      // no-op
    }
  }

  /**
   * Zera o estado completo (falhas + lock) — chamado pelo `GET /auth/otp-unlock/:token`.
   */
  async unlock(accountId: string): Promise<void> {
    const l = await this.limiter();
    if (!l || !accountId) return;
    try {
      await this.failStore(l).delete(this.failKey(accountId));
      await this.lockStore(l).delete(this.lockKey(accountId));
    } catch {
      // no-op
    }
  }
}

export function createOtpLockout(
  cfg: ResolvedOtpLockoutSetting,
  logger?: OtpLockoutLogger,
): OtpLockout {
  return new OtpLockout(cfg, logger);
}
