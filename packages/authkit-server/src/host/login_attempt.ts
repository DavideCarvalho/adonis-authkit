import type { AuthAccount } from '../accounts/account_store.js'
import type { ResolvedServerConfig } from '../define_config.js'
import { createAccountLockout } from './account_lockout.js'

/** Entrada de uma tentativa de login por senha (keyed por email). */
export interface PasswordLoginInput {
  email: string
  password: string
  /** IP da request (para auditoria + lockout). null quando indisponível. */
  ip: string | null
  /**
   * client_id da interaction OIDC, quando existir. Só é incluído no evento de
   * auditoria nos fluxos que o têm (interaction); ausente no console de conta.
   */
  clientId?: string | null
}

/** Resultado de {@link attemptPasswordLogin}. */
export type PasswordLoginResult =
  | { ok: true; account: AuthAccount }
  | { ok: false; locked: boolean; retryAfterSec?: number }

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
  input: PasswordLoginInput
): Promise<PasswordLoginResult> {
  const { email, password, ip } = input
  const lockout = createAccountLockout(cfg.lockout)

  // Bloqueio progressivo (keyed por email): se travada, não verifica a senha.
  const lock = await lockout.isLocked(email)
  if (lock.locked) {
    return { ok: false, locked: true, retryAfterSec: lock.retryAfterSec }
  }

  const account = await cfg.accountStore.verifyCredentials(email, password)
  if (!account) {
    // `clientId` só entra no evento quando o fluxo o fornece (interaction).
    await cfg.audit?.record(
      input.clientId !== undefined
        ? { type: 'login.failure', email, ip, clientId: input.clientId }
        : { type: 'login.failure', email, ip }
    )
    await lockout.recordFailure(email, { sink: cfg.audit, ip })
    return { ok: false, locked: false }
  }

  // Senha correta: limpa o contador de falhas (o lockout protege a etapa de senha).
  await lockout.clearFailures(email)
  return { ok: true, account }
}
