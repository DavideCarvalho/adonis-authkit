import type { AuthSocialConfig, ResolvedRateLimitConfig } from '../define_config.js';

/**
 * Bits de routing do config resolvido que o `registerAuthHost` precisa em tempo de
 * REGISTRO de rota (síncrono). Stash feito no `boot()` do provider — que roda ANTES
 * dos preloads (start/routes.ts) — para que `registerAuthHost` leia do config em vez
 * de exigir que o consumidor reespecifique tudo (elimina o drift config↔registerAuthHost).
 *
 * Module-level porque o IdP é um por processo (mesmo padrão de config_locks).
 */
export interface AuthHostRuntimeConfig {
  mountPath: string;
  social?: AuthSocialConfig;
  rateLimit: ResolvedRateLimitConfig;
  adminEnabled: boolean;
  adminApiEnabled: boolean;
}

let stashed: AuthHostRuntimeConfig | undefined;

/** Stash dos bits de routing (chamado no boot do provider). */
export function setAuthHostConfig(config: AuthHostRuntimeConfig): void {
  stashed = config;
}

/** Lê os bits de routing stashados; undefined se o boot ainda não rodou (fallback p/ opts/defaults). */
export function getAuthHostConfig(): AuthHostRuntimeConfig | undefined {
  return stashed;
}

/** Limpa o stash — uso em testes. */
export function resetAuthHostConfig(): void {
  stashed = undefined;
}
