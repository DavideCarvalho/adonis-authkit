/**
 * Config locks — quando uma feature/política é definida explicitamente no
 * `defineConfig`, ela fica TRAVADA: o valor do config manda e a UI/Admin API NÃO
 * pode mais alterá-la em runtime. Quando NÃO está no config, a UI controla
 * livremente o valor (runtime setting em `auth_settings`).
 *
 * Mecânica (elegante, sem tocar nos ~20 resolvers):
 *   - `RuntimeSettings.getSetting` retorna `null` para keys travadas → cada
 *     `resolveEffective*` cai no `configDefault` (= o valor do config). Logo, config vence.
 *   - `RuntimeSettings.setSetting`/`deleteSetting` lançam {@link SettingLockedError}
 *     para keys travadas → o write path da Admin API/console rejeita com 423.
 *   - A UI lê a lista de keys travadas (`lockedSettingKeys()`) e desabilita o
 *     controle + mostra o aviso "definido via defineConfig".
 *
 * O registro é MODULE-LEVEL e setado uma vez no boot do provider — o IdP é um por
 * processo e os locks vêm de config estático (imutável pós-boot).
 */

import { SETTING_KEYS } from './runtime_toggles.js';

/**
 * Deriva as keys de `auth_settings` travadas a partir dos campos EXPLICITAMENTE
 * presentes no input do `defineConfig`. Só mapeia keys que têm contraparte tanto
 * em config quanto na UI (runtime setting); features sem campo de config nunca
 * travam (UI sempre controla).
 */
export function deriveLockedSettingKeys(config: Record<string, any>): string[] {
  const locked: string[] = [];
  const add = (present: unknown, key: string) => {
    if (present) locked.push(key);
  };
  add(config.registration !== undefined, SETTING_KEYS.REGISTRATION);
  // authMethods no config trava a key inteira `auth_methods`: os métodos passam a ser
  // controlados pelo arquivo (via cfg.authMethods → configOverrides no resolver) e a UI
  // desabilita os toggles com "definido via defineConfig".
  add(config.authMethods !== undefined, SETTING_KEYS.AUTH_METHODS);
  add(config.login?.requireVerifiedEmail !== undefined, SETTING_KEYS.REQUIRE_VERIFIED_EMAIL);
  add(config.lockout !== undefined, SETTING_KEYS.LOCKOUT);
  add(config.rateLimit !== undefined, SETTING_KEYS.RATE_LIMIT);
  add(config.trustedDevices !== undefined, SETTING_KEYS.TRUSTED_DEVICES);
  add(config.botProtection !== undefined, SETTING_KEYS.BOT_PROTECTION);
  add(config.organizations !== undefined, SETTING_KEYS.ORGANIZATIONS_POLICY);
  add(config.admin?.impersonation !== undefined, SETTING_KEYS.ADMIN_IMPERSONATION);
  add(config.ttl !== undefined, SETTING_KEYS.TOKEN_TTL);
  return locked;
}

/** Erro lançado ao tentar gravar/remover uma setting travada via `defineConfig`. */
export class SettingLockedError extends Error {
  readonly code = 'E_SETTING_LOCKED';
  readonly key: string;
  constructor(key: string) {
    super(
      `A setting "${key}" foi definida via defineConfig() e está travada — não pode ser alterada em runtime (console/Admin API). Remova-a do defineConfig para liberar a edição pela UI.`,
    );
    this.name = 'SettingLockedError';
    this.key = key;
  }
}

let lockedKeys = new Set<string>();

/** Define o conjunto de keys travadas (chamado uma vez no boot do provider). */
export function setLockedSettingKeys(keys: Iterable<string>): void {
  lockedKeys = new Set(keys);
}

/** Limpa os locks — uso em testes. */
export function resetLockedSettingKeys(): void {
  lockedKeys = new Set();
}

/** A setting `key` está travada por config? */
export function isSettingLocked(key: string): boolean {
  return lockedKeys.has(key);
}

/** Lista (snapshot) das keys travadas — consumida pelo read path da UI. */
export function lockedSettingKeys(): string[] {
  return [...lockedKeys];
}
