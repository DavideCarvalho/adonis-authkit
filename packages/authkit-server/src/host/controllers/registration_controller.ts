import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { brandFor } from '../branding.js'
import { signupValidator, forgotPasswordValidator, resetPasswordValidator } from '../validators.js'
import { sendPasswordResetEmail, sendEmailVerificationEmail } from '../default_mailer.js'
import { translate } from '../i18n.js'

export default class AuthRegistrationController {
  /** GET /auth/interaction/:uid/signup — tela de cadastro (dentro do fluxo OIDC). */
  async showSignup(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(cfg.branding!, details.params.client_id as string | undefined)
    return render(ctx, 'signup', {
      uid: details.uid,
      csrfToken: ctx.request.csrfToken,
      brand,
    })
  }

  /** POST /auth/interaction/:uid/signup — cria o usuário e finaliza o login. */
  async signup(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(cfg.branding!, details.params.client_id as string | undefined)
    const data = await ctx.request.validateUsing(signupValidator)

    const accountStore = cfg.accountStore
    const existing = await accountStore.findByEmail(data.email)
    if (existing) {
      return render(ctx, 'signup', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.email_taken'),
        brand,
      })
    }

    const created = await accountStore.create({
      email: data.email,
      password: data.password,
      fullName: data.fullName,
    })
    await cfg.audit?.record({
      type: 'signup',
      accountId: created?.id ?? null,
      email: data.email,
      ip: ctx.request.ip?.() ?? null,
      clientId: (details.params.client_id as string | undefined) ?? null,
    })

    // Finaliza a interaction como login (interactionFinished escreve o redirect 303 que
    // retoma o authorize; o form nativo da tela segue esse redirect no sucesso).
    const result = await service.interactions.login(ctx, {
      email: data.email,
      password: data.password,
    })
    if (!result.ok) {
      return render(ctx, 'signup', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.signup_failed'),
        brand,
      })
    }

    // Verificação de e-mail (best-effort — não bloqueia nem reverte o login).
    try {
      const issued = await accountStore.issueEmailVerificationToken(data.email)
      if (issued) {
        await cfg.audit?.record({
          type: 'email_verification.issued',
          accountId: created?.id ?? null,
          email: data.email,
          ip: ctx.request.ip?.() ?? null,
        })
        const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
        const verifyUrl = `${origin}/auth/verify-email?token=${issued.token}`
        // Hook do config tem prioridade (override); senão usa o mailer default do host.
        if (cfg.mail?.onEmailVerification) {
          await cfg.mail.onEmailVerification({ email: data.email, verifyUrl, token: issued.token })
        } else {
          await sendEmailVerificationEmail(ctx, { email: data.email, verifyUrl })
        }
      }
    } catch (error) {
      ctx.logger.error({ err: error, email: data.email }, 'authkit: falha ao enviar verificação de e-mail')
    }
  }

  /** GET /auth/forgot-password — tela standalone. */
  async showForgot(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    return render(ctx, 'forgot', { csrfToken: ctx.request.csrfToken })
  }

  /** POST /auth/forgot-password — gera token e (dev) loga o link. Sempre responde sucesso (não vaza emails). */
  async forgot(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const { email } = await ctx.request.validateUsing(forgotPasswordValidator)
    const accountStore = cfg.accountStore
    const result = await accountStore.issuePasswordResetToken(email)
    if (result) {
      await cfg.audit?.record({
        type: 'password_reset.issued',
        email,
        ip: ctx.request.ip?.() ?? null,
      })
      const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
      const url = `${origin}/auth/reset-password?token=${result.token}`
      // Hook do config tem prioridade (override); senão usa o mailer default do host.
      if (cfg.mail?.onPasswordReset) {
        await cfg.mail.onPasswordReset({ email, resetUrl: url, token: result.token })
      } else {
        await sendPasswordResetEmail(ctx, { email, resetUrl: url })
      }
    }
    return render(ctx, 'forgot', {
      csrfToken: ctx.request.csrfToken,
      sent: true,
    })
  }

  /** GET /auth/reset-password?token=... — tela standalone. */
  async showReset(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const token = ctx.request.qs().token ?? ''
    return render(ctx, 'reset', { token, csrfToken: ctx.request.csrfToken })
  }

  /** POST /auth/reset-password — redefine a senha. */
  async reset(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const { token, password } = await ctx.request.validateUsing(resetPasswordValidator)
    const accountStore = cfg.accountStore
    const ok = await accountStore.consumePasswordResetToken(token, password)
    if (!ok) {
      return ctx.response.badRequest({ error: translate(cfg.messages, 'errors.invalid_or_expired_token') })
    }
    await cfg.audit?.record({
      type: 'password_reset.consumed',
      ip: ctx.request.ip?.() ?? null,
    })
    return render(ctx, 'reset', {
      token: '',
      csrfToken: ctx.request.csrfToken,
      done: true,
    })
  }

  /** GET /auth/verify-email?token=... — consome o token e mostra sucesso/falha. */
  async verifyEmail(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const token = ctx.request.qs().token ?? ''
    const ok = await cfg.accountStore.consumeEmailVerificationToken(token)
    if (ok) {
      await cfg.audit?.record({
        type: 'email_verification.consumed',
        ip: ctx.request.ip?.() ?? null,
      })
    }
    return render(ctx, 'verify-email', { verified: ok })
  }
}
