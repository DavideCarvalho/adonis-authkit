import type { HttpContext } from '@adonisjs/core/http'
import type { BrandingConfig } from './branding.js'
import { renderTransactionalEmail, type EmailContent } from './email_templates.js'

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
    const content = renderTransactionalEmail({
      brand,
      subject: 'Redefinição de senha',
      heading: 'Redefinição de senha',
      intro: `Recebemos um pedido para redefinir a senha da sua conta em ${brand.appName}. Clique no botão abaixo para escolher uma nova senha. Se não foi você, ignore este e-mail.`,
      ctaLabel: 'Redefinir senha',
      ctaUrl: data.resetUrl,
      footnote: 'Por segurança, este link expira em breve e só pode ser usado uma vez.',
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
 * Envia o e-mail de verificação pelo mailer default do host.
 * Best-effort: no fallback (sem mail) loga o link; nunca lança.
 */
export async function sendEmailVerificationEmail(
  ctx: HttpContext,
  data: { email: string; verifyUrl: string }
): Promise<void> {
  try {
    const brand = resolveBrand(ctx)
    const content = renderTransactionalEmail({
      brand,
      subject: 'Verifique seu e-mail',
      heading: 'Confirme seu e-mail',
      intro: `Bem-vindo(a) ao ${brand.appName}! Confirme seu endereço de e-mail clicando no botão abaixo para ativar sua conta.`,
      ctaLabel: 'Verificar e-mail',
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
