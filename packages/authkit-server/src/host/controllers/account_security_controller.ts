import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { ACCOUNT_SESSION_KEY } from '../middleware/account_auth.js'
import { supportsAccountSecurity } from '../../accounts/account_store.js'
import { changePasswordValidator, changeEmailValidator } from '../validators.js'
import { sendEmailChangeConfirmationEmail } from '../default_mailer.js'
import { translate } from '../i18n.js'

/**
 * Self-service de segurança da conta (console de conta): trocar a senha e o
 * e-mail. A troca de senha exige a senha ATUAL (verifyCredentials). A troca de
 * e-mail exige a senha atual e dispara um link de confirmação para o NOVO
 * endereço (consumido em GET /account/email/confirm). Degrada graciosamente se o
 * store não suportar a capacidade ({@link supportsAccountSecurity}).
 */
export default class AccountSecurityController {
  async index(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    const account = await cfg.accountStore.findById(userId)

    return render(ctx, 'account/security', {
      csrfToken: ctx.request.csrfToken,
      supported: supportsAccountSecurity(cfg.accountStore),
      email: account?.email ?? '',
      passwordChanged: ctx.session.flashMessages.get('passwordChanged') ?? null,
      emailChangeRequested: ctx.session.flashMessages.get('emailChangeRequested') ?? null,
      emailChanged: ctx.session.flashMessages.get('emailChanged') ?? null,
      error: ctx.session.flashMessages.get('securityError') ?? null,
    })
  }

  async changePassword(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const store = cfg.accountStore

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    if (!supportsAccountSecurity(store)) {
      return ctx.response.redirect('/account/security')
    }

    const { currentPassword, newPassword } = await ctx.request.validateUsing(changePasswordValidator)
    const account = await store.findById(userId)
    // Confirma a senha ATUAL pelo e-mail da conta.
    const verified = account
      ? await store.verifyCredentials(account.email, currentPassword)
      : null
    if (!verified) {
      ctx.session.flash('securityError', translate(cfg.messages, 'errors.invalid_credentials'))
      return ctx.response.redirect('/account/security')
    }

    await store.changePassword(userId, newPassword)
    await cfg.audit?.record({
      type: 'password.changed',
      accountId: userId,
      ip: ctx.request.ip?.() ?? null,
    })
    ctx.session.flash('passwordChanged', translate(cfg.messages, 'account.security.password_changed'))
    return ctx.response.redirect('/account/security')
  }

  async changeEmail(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const store = cfg.accountStore

    const userId = ctx.session.get(ACCOUNT_SESSION_KEY) as string
    if (!supportsAccountSecurity(store)) {
      return ctx.response.redirect('/account/security')
    }

    const { currentPassword, newEmail } = await ctx.request.validateUsing(changeEmailValidator)
    const account = await store.findById(userId)
    const verified = account
      ? await store.verifyCredentials(account.email, currentPassword)
      : null
    if (!verified) {
      ctx.session.flash('securityError', translate(cfg.messages, 'errors.invalid_credentials'))
      return ctx.response.redirect('/account/security')
    }

    const issued = await store.requestEmailChange(userId, newEmail)
    if (!issued) {
      ctx.session.flash('securityError', translate(cfg.messages, 'errors.email_taken'))
      return ctx.response.redirect('/account/security')
    }

    await cfg.audit?.record({
      type: 'email.change_requested',
      accountId: userId,
      email: newEmail,
      ip: ctx.request.ip?.() ?? null,
    })

    const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
    const confirmUrl = `${origin}/account/email/confirm?token=${encodeURIComponent(issued.token)}`
    // Hook do config tem prioridade (override); senão usa o mailer default do host.
    if (cfg.mail?.onEmailVerification) {
      await cfg.mail.onEmailVerification({ email: newEmail, verifyUrl: confirmUrl, token: issued.token })
    } else {
      await sendEmailChangeConfirmationEmail(ctx, { email: newEmail, confirmUrl })
    }

    ctx.session.flash(
      'emailChangeRequested',
      translate(cfg.messages, 'account.security.email_change_requested', { email: newEmail })
    )
    return ctx.response.redirect('/account/security')
  }

  /** GET /account/email/confirm?token=... — consome o token e aplica o novo e-mail. */
  async confirmEmail(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const store = cfg.accountStore
    const render = cfg.render!

    if (!supportsAccountSecurity(store)) {
      return render(ctx, 'account/email-confirmed', { ok: false })
    }

    const token = ctx.request.qs().token ?? ''
    const result = await store.confirmEmailChange(token)
    if (result.ok) {
      await cfg.audit?.record({
        type: 'email.changed',
        accountId: result.account.id,
        email: result.newEmail,
        ip: ctx.request.ip?.() ?? null,
      })
    }
    return render(ctx, 'account/email-confirmed', { ok: result.ok })
  }
}
