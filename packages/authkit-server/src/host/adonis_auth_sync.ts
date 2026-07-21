import type { HttpContext } from '@adonisjs/core/http';
import type { AuthAccount } from '../accounts/account_store.js';
import type { ResolvedServerConfig } from '../define_config.js';

/**
 * Sincroniza `ctx.auth` (`@adonisjs/auth`) com um login bem-sucedido no console
 * de conta do authkit. Ver `adonisAuth` em `define_config.ts` pro porquê: sem
 * isso, `ctx.auth.user` nunca é populado por nenhum fluxo do authkit-server —
 * mesmo num host que roda `@adonisjs/auth` normalmente.
 *
 * NO-OP quando:
 *   - `adonisAuth.guard` não está configurado (opt-in; default é não tocar em
 *     `ctx.auth` — comportamento de sempre).
 *   - `ctx.auth` não existe nesta request (host sem `InitializeAuthMiddleware`
 *     de `@adonisjs/auth` registrado — o peer é opcional).
 *
 * BEST-EFFORT: uma falha aqui (ex.: guard mal configurado em `config/auth.ts`)
 * NUNCA quebra o login do authkit — o cookie bespoke (`ACCOUNT_SESSION_KEY`)
 * já é a fonte de verdade das rotas do próprio authkit e continua funcionando
 * mesmo se a sincronização com `@adonisjs/auth` falhar. Loga um warning para
 * não mascarar um guard mal configurado silenciosamente.
 */
export async function syncAdonisAuthLogin(
  ctx: HttpContext,
  cfg: Pick<ResolvedServerConfig, 'adonisAuth'>,
  account: AuthAccount,
): Promise<void> {
  const guard = cfg.adonisAuth?.guard;
  const auth = (ctx as any).auth;
  if (!guard || !auth) return;
  try {
    await auth.use(guard).login(account);
  } catch (error) {
    ctx.logger?.warn(
      { err: error, guard },
      'authkit: falha ao sincronizar login com @adonisjs/auth (adonisAuth.guard) — ' +
        'ctx.auth.user pode não refletir a conta logada; o cookie do authkit segue normal',
    );
  }
}

/**
 * Sincroniza `ctx.auth` com um logout do console de conta. Ver
 * {@link syncAdonisAuthLogin} para as mesmas regras de no-op/best-effort.
 */
export async function syncAdonisAuthLogout(
  ctx: HttpContext,
  cfg: Pick<ResolvedServerConfig, 'adonisAuth'>,
): Promise<void> {
  const guard = cfg.adonisAuth?.guard;
  const auth = (ctx as any).auth;
  if (!guard || !auth) return;
  try {
    await auth.use(guard).logout();
  } catch (error) {
    ctx.logger?.warn(
      { err: error, guard },
      'authkit: falha ao sincronizar logout com @adonisjs/auth (adonisAuth.guard)',
    );
  }
}
