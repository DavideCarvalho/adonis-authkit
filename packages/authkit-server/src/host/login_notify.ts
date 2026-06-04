import type { HttpContext } from '@adonisjs/core/http'
import type { ResolvedServerConfig } from '../define_config.js'
import { sendNewLoginEmail } from './default_mailer.js'

/** Dados de um login bem-sucedido a auditar/notificar. */
export interface LoginSuccessInput {
  accountId: string
  email?: string | null
  ip?: string | null
  clientId?: string | null
  /** Metadata extra a anexar ao evento login.success (ex.: { mfa: 'totp' }). */
  metadata?: Record<string, unknown>
}

/**
 * Centraliza o pós-login bem-sucedido: registra o evento `login.success` e dispara
 * (best-effort) o alerta de NOVO acesso quando o IP nunca foi visto para a conta.
 *
 * É fire-and-forget e FAIL-SAFE: a notificação roda DEPOIS do audit e qualquer erro
 * é engolido — NUNCA bloqueia nem lança no caminho do login. Substitui as chamadas
 * `cfg.audit?.record({ type: 'login.success', ... })` espalhadas pelos controllers.
 */
export async function notifyLoginSuccess(
  ctx: HttpContext,
  cfg: ResolvedServerConfig,
  input: LoginSuccessInput
): Promise<void> {
  const { accountId, email, ip, clientId, metadata } = input

  // 1) Audit do login.success (mesmo formato de antes).
  await cfg.audit?.record({
    type: 'login.success',
    accountId,
    email: email ?? null,
    ip: ip ?? null,
    clientId: clientId ?? null,
    metadata,
  })

  // 2) Alerta de novo acesso (opt-out via notifications.newLoginEmail: false).
  if (!cfg.notifications.newLoginEmail) return
  // Fire-and-forget: nunca propaga erro pro caminho do login.
  void (async () => {
    // Resolve o e-mail quando o caller não o forneceu (ex.: fluxo de MFA só tem o
    // accountId em escopo). Best-effort.
    let resolvedEmail = email ?? null
    if (!resolvedEmail) {
      resolvedEmail = (await cfg.accountStore.findById(accountId))?.email ?? null
    }
    await maybeNotifyNewLogin(ctx, cfg, { accountId, email: resolvedEmail, ip: ip ?? null })
  })().catch((error) => {
    ctx.logger.error({ err: error, accountId }, 'authkit: falha no alerta de novo acesso')
  })
}

/**
 * Verifica se o IP é novo para a conta (consultando o audit sink por
 * `login.success` do subject) e, se for, envia o e-mail de alerta + audita
 * `login.new_ip_notified`. Degrada para no-op quando: sem IP, sem e-mail, sem
 * sink consultável (`list`), ou já houve um login.success deste IP antes.
 */
async function maybeNotifyNewLogin(
  ctx: HttpContext,
  cfg: ResolvedServerConfig,
  data: { accountId: string; email: string | null; ip: string | null }
): Promise<void> {
  const { accountId, email, ip } = data
  if (!ip || !email) return
  // Sem consulta do histórico não dá pra decidir se o IP é novo → no-op.
  if (typeof cfg.audit?.list !== 'function') return

  // Lê o histórico de login.success do subject. O evento ATUAL já foi gravado por
  // notifyLoginSuccess, então um IP visto antes aparece com count >= 2 para o IP.
  // Buscamos uma página ampla e contamos as ocorrências deste IP.
  const page = await cfg.audit.list({
    type: 'login.success',
    subject: accountId,
    page: 1,
    limit: 200,
  })
  const sameIpCount = page.data.filter((e) => e.ip === ip).length
  // > 1 significa que já havia um login.success deste IP antes do atual → não é novo.
  if (sameIpCount > 1) return

  const when = new Date().toISOString()
  await sendNewLoginEmail(ctx, { email, ip, when })
  await cfg.audit?.record({
    type: 'login.new_ip_notified',
    accountId,
    email,
    ip,
  })
}
