import { configProvider } from '@adonisjs/core';
import type { ApplicationService } from '@adonisjs/core/types';

/**
 * Resolve o valor exportado por `config/authkit.ts` para a config final.
 *
 * `defineConfig` retorna um config PROVIDER (`{ type, resolver }`) que o service
 * provider resolve no boot — mas `config.get('authkit')` devolve esse provider
 * CRU. Comandos ace que leem a config diretamente (doctor, users:import,
 * keys:rotate) precisam resolvê-lo antes de inspecionar campos, senão veem
 * `issuer`/`accountStore`/`jwks` como ausentes mesmo num config válido.
 *
 * Valores planos (configs antigos/test fixtures) passam direto.
 */
export async function resolveAuthkitConfig<T = Record<string, any>>(
  app: ApplicationService,
  raw: unknown,
): Promise<T | null> {
  if (!raw) return null;
  const resolved = (await configProvider.resolve(app, raw as any)) as T | null;
  return resolved ?? (raw as T);
}
