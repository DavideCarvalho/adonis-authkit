import type { HttpContext } from '@adonisjs/core/http'
import type { BrandingConfig } from './branding.js'
import { renderTransactionalEmail, type EmailContent } from './email_templates.js'
import {
  resolveMessages,
  translate,
  type AuthMessages,
  type I18nConfig,
} from './i18n.js'

/**
 * Envio de e-mail default do host-kit, usando o mailer `default` do host via
 * `@adonisjs/mail`. Permite que o dev não escreva nenhum hook: por padrão os
 * e-mails de reset de senha / verificação são enviados pelo mailer já configurado
 * no app, com HTML responsivo + branding (do `config/authkit.ts`) e fallback texto.
 * Os hooks de `config/authkit.ts` (`mail.onPasswordReset` /
 * `mail.onEmailVerification`), quando presentes, têm prioridade (override).
 *
 * Best-effort: se `@adonisjs/mail` não estiver instalado/configurado, cai no
 * fallback de log (mesmo comportamento de antes) e NUNCA lança na request.
 */

/**
 * Service do `@adonisjs/mail` resolvido de forma preguiçosa. Tipado como `any` de
 * propósito: a lib NÃO depende do mail em tempo de compilação (peer/opt-in).
 */
type MailService = any

let mailServicePromise: Promise<MailService | null> | undefined

/**
 * Importa o service de mail do HOST de forma preguiçosa e fail-safe.
 * Se `@adonisjs/mail` não estiver instalado, resolve `null`.
 */
async function loadMail(): Promise<MailService | null> {
  if (!mailServicePromise) {
    // Indireção via variável: o `@adonisjs/mail` é peer/opcional e pode não estar
    // instalado na lib, então o specifier não é resolvido em build-time.
    const specifier = '@adonisjs/mail/services/main'
    mailServicePromise = import(specifier)
      .then((mod) => (mod as any).default ?? null)
      .catch(() => null)
  }
  return mailServicePromise
}

/**
 * Permite reapontar/limpar o loader do mail (usado em testes).
 * @internal
 */
export function __setMailLoaderForTests(fn: (() => Promise<MailService | null>) | undefined): void {
  if (fn) {
    mailServicePromise = fn()
  } else {
    mailServicePromise = undefined
  }
}

/**
 * Tenta descobrir o `from` default da config de mail do host. Se não houver,
 * retorna `undefined` (deixa o @adonisjs/mail aplicar o default da própria config).
 */
function defaultFrom(ctx: HttpContext): { address: string; name?: string } | string | undefined {
  try {
    // Alcançamos a config de `mail` do HOST via o resolver do container. Esse
    // formato é específico do app (a lib não conhece o shape da config de mail
    // nem `containerResolver.app` é público), então tipamos apenas ESTE acesso
    // como `unknown`/cast estreito — não o `HttpContext` inteiro.
    const resolver = ctx.containerResolver as unknown as {
      app?: { config?: { get?: (key: string) => { from?: unknown } | undefined } }
    }
    const cfg = resolver.app?.config?.get?.('mail')
    const from = cfg?.from as { address: string; name?: string } | string | undefined
    if (from) return from
  } catch {
    // sem config de mail resolvível — deixa o @adonisjs/mail decidir.
  }
  return undefined
}

/**
 * Resolve a marca default a partir do `config/authkit.ts` (branding.default +
 * company). Usada para o cabeçalho/cor de acento/rodapé dos e-mails. Cai num
 * default neutro se a config não for resolvível.
 */
function resolveBrand(ctx: HttpContext): {
  appName: string
  accent?: string
  company?: string
} {
  try {
    const resolver = ctx.containerResolver as unknown as {
      app?: { config?: { get?: (key: string) => { branding?: BrandingConfig } | undefined } }
    }
    const branding = resolver.app?.config?.get?.('authkit')?.branding
    if (branding) {
      return {
        appName: branding.default?.appName || branding.company || 'AuthKit',
        accent: branding.default?.accent,
        company: branding.company,
      }
    }
  } catch {
    // sem config authkit resolvível — usa default neutro.
  }
  return { appName: 'AuthKit' }
}

/**
 * Resolve o catálogo de mensagens i18n a partir do `config/authkit.ts` (i18n).
 * Cai no default (`en`) se a config não for resolvível. Usado para localizar
 * os e-mails transacionais (assunto/cabeçalho/corpo).
 */
function resolveMailMessages(ctx: HttpContext): { messages: AuthMessages; locale: string } {
  try {
    const resolver = ctx.containerResolver as unknown as {
      app?: { config?: { get?: (key: string) => { i18n?: I18nConfig } | undefined } }
    }
    const i18n = resolver.app?.config?.get?.('authkit')?.i18n
    return { messages: resolveMessages(i18n), locale: i18n?.locale ?? 'en' }
  } catch {
    // sem config authkit resolvível — usa o default `en`.
    return { messages: resolveMessages(), locale: 'en' }
  }
}

async function sendEmail(ctx: HttpContext, to: string, content: EmailContent): Promise<boolean> {
  const mail = await loadMail()
  if (!mail) return false
  const from = defaultFrom(ctx)
  await mail.send((message: any) => {
    if (from) message.from(from)
    message.to(to).subject(content.subject).html(content.html).text(content.text)
  })
  return true
}

/**
 * Envia o e-mail de redefinição de senha pelo mailer default do host.
 * Best-effort: no fallback (sem mail) loga o link; nunca lança.
 */
export async function sendPasswordResetEmail(
  ctx: HttpContext,
  data: { email: string; resetUrl: string }
): Promise<void> {
  try {
    const brand = resolveBrand(ctx)
    const { messages: t, locale } = resolveMailMessages(ctx)
    const content = renderTransactionalEmail({
      brand,
      locale,
      linkFallback: translate(t, 'mail.common.link_fallback'),
      subject: translate(t, 'mail.reset.subject'),
      heading: translate(t, 'mail.reset.heading'),
      intro: translate(t, 'mail.reset.intro'),
      ctaLabel: translate(t, 'mail.reset.cta'),
      ctaUrl: data.resetUrl,
      footnote: translate(t, 'mail.reset.fallback'),
    })
    const sent = await sendEmail(ctx, data.email, content)
    if (!sent) {
      ctx.logger.info(
        { resetUrl: data.resetUrl, email: data.email },
        'authkit: link de redefinição de senha (dev — @adonisjs/mail ausente)'
      )
    }
  } catch (error) {
    ctx.logger.error(
      { err: error, email: data.email },
      'authkit: falha ao enviar e-mail de redefinição de senha'
    )
  }
}

/**
 * Envia o e-mail de confirmação de TROCA de e-mail para o NOVO endereço.
 * Best-effort: no fallback (sem mail) loga o link; nunca lança.
 */
export async function sendEmailChangeConfirmationEmail(
  ctx: HttpContext,
  data: { email: string; confirmUrl: string }
): Promise<void> {
  try {
    const brand = resolveBrand(ctx)
    const { messages: t, locale } = resolveMailMessages(ctx)
    const content = renderTransactionalEmail({
      brand,
      locale,
      linkFallback: translate(t, 'mail.common.link_fallback'),
      subject: translate(t, 'mail.email_change.subject'),
      heading: translate(t, 'mail.email_change.heading'),
      intro: translate(t, 'mail.email_change.intro'),
      ctaLabel: translate(t, 'mail.email_change.cta'),
      ctaUrl: data.confirmUrl,
      footnote: translate(t, 'mail.email_change.fallback'),
    })
    const sent = await sendEmail(ctx, data.email, content)
    if (!sent) {
      ctx.logger.info(
        { confirmUrl: data.confirmUrl, email: data.email },
        'authkit: link de confirmação de troca de e-mail (dev — @adonisjs/mail ausente)'
      )
    }
  } catch (error) {
    ctx.logger.error(
      { err: error, email: data.email },
      'authkit: falha ao enviar confirmação de troca de e-mail'
    )
  }
}

/**
 * Envia o e-mail de alerta de NOVO acesso à conta (login de um IP novo).
 * Best-effort: no fallback (sem mail) loga o evento; nunca lança.
 */
export async function sendNewLoginEmail(
  ctx: HttpContext,
  data: { email: string; ip: string; when: string }
): Promise<void> {
  try {
    const brand = resolveBrand(ctx)
    const { messages: t, locale } = resolveMailMessages(ctx)
    const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
    const intro = [
      translate(t, 'mail.new_login.intro'),
      translate(t, 'mail.new_login.when', { date: data.when }),
      translate(t, 'mail.new_login.ip', { ip: data.ip }),
    ].join(' ')
    const content = renderTransactionalEmail({
      brand,
      locale,
      linkFallback: translate(t, 'mail.common.link_fallback'),
      subject: translate(t, 'mail.new_login.subject'),
      heading: translate(t, 'mail.new_login.heading'),
      intro,
      ctaLabel: translate(t, 'account.security.title'),
      ctaUrl: `${origin}/account/security`,
      footnote: translate(t, 'mail.new_login.fallback'),
    })
    const sent = await sendEmail(ctx, data.email, content)
    if (!sent) {
      ctx.logger.info(
        { ip: data.ip, email: data.email },
        'authkit: alerta de novo acesso (dev — @adonisjs/mail ausente)'
      )
    }
  } catch (error) {
    ctx.logger.error(
      { err: error, email: data.email },
      'authkit: falha ao enviar alerta de novo acesso'
    )
  }
}

/**
 * Envia o e-mail de verificação pelo mailer default do host.
 * Best-effort: no fallback (sem mail) loga o link; nunca lança.
 */
export async function sendEmailVerificationEmail(
  ctx: HttpContext,
  data: { email: string; verifyUrl: string }
): Promise<void> {
  try {
    const brand = resolveBrand(ctx)
    const { messages: t, locale } = resolveMailMessages(ctx)
    const content = renderTransactionalEmail({
      brand,
      locale,
      linkFallback: translate(t, 'mail.common.link_fallback'),
      subject: translate(t, 'mail.verify.subject'),
      heading: translate(t, 'mail.verify.heading'),
      intro: translate(t, 'mail.verify.intro'),
      ctaLabel: translate(t, 'mail.verify.cta'),
      ctaUrl: data.verifyUrl,
    })
    const sent = await sendEmail(ctx, data.email, content)
    if (!sent) {
      ctx.logger.info(
        { verifyUrl: data.verifyUrl, email: data.email },
        'authkit: link de verificação de e-mail (dev — @adonisjs/mail ausente)'
      )
    }
  } catch (error) {
    ctx.logger.error(
      { err: error, email: data.email },
      'authkit: falha ao enviar verificação de e-mail'
    )
  }
}
