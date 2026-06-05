import '../augmentations.js'
import type { HttpContext } from '@adonisjs/core/http'
import { brandFor, isFirstParty } from '../branding.js'
import { translate } from '../i18n.js'
import { attemptPasswordLogin, isEmailUnverifiedBlock } from '../login_attempt.js'
import { notifyLoginSuccess } from '../login_notify.js'
import { guardBotProtection, resolveEffectiveBotProtection } from '../bot_protection.js'
import { RuntimeSettings } from '../runtime_settings.js'
import {
  resolveEffectiveMaintenanceMode,
  resolveEffectiveRegistration,
  resolveEffectiveAuthMethods,
} from '../runtime_toggles.js'
import { supportsPasskeys, supportsMagicLink } from '../../accounts/account_store.js'
import { sendMagicLinkEmail } from '../default_mailer.js'
import {
  TRUSTED_DEVICE_COOKIE,
  buildTrustedDevicePayload,
  isTrustedDeviceValid,
} from '../trusted_device.js'

/** Best-effort: returns a RuntimeSettings backed by the container DB, or a no-op fallback. */
async function getRuntimeSettings(ctx: HttpContext): Promise<RuntimeSettings> {
  try {
    const db = await ctx.containerResolver.make('lucid.db')
    return new RuntimeSettings(db)
  } catch {
    // Fallback: no-table probe always returns null → config fallback
    return new RuntimeSettings({ connection: async () => ({ schema: { async hasTable() { return false } } }), table: () => { throw new Error() } })
  }
}

const SESSION_KEY = 'authkit_login_email'
/** accountId aguardando o 2º fator depois da senha verificada. */
const MFA_PENDING_KEY = 'authkit_mfa_pending'
/** Desafio WebAuthn pendente (autenticação) guardado entre begin/finish no login. */
const PASSKEY_AUTH_CHALLENGE_KEY = 'authkit_passkey_auth_challenge'

export default class AuthInteractionController {
  async show(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )

    // Maintenance mode: verifica se é uma conta admin antes de bloquear.
    // Contas admin continuam podendo logar para que o operador possa desligar a
    // manutenção via console. Contas comuns veem a tela de manutenção.
    const runtimeSettingsForMaintenance = await getRuntimeSettings(ctx)
    const maintenance = await resolveEffectiveMaintenanceMode(runtimeSettingsForMaintenance)
    if (maintenance.enabled) {
      // Verifica se já há uma conta admin na sessão (já autenticado) OU
      // se o prompt não é de login — nesse caso, permite prosseguir.
      // Para o prompt de login: permite continuar sem bloquear; o guard real
      // está no POST. Dessa forma o admin pode inserir email/senha normalmente.
      // A tela de manutenção é exibida apenas para o prompt de login quando
      // não há indicação de conta admin (antes de autenticar não sabemos a role).
      // Decisão: exibimos a tela de manutenção SOMENTE se não for conta admin.
      // Como não sabemos a role antes de autenticar, exibimos a tela com uma nota
      // de que admins podem continuar — o POST real tem o guard.
      if (details.prompt.name === 'login') {
        return render(ctx, 'maintenance', {
          uid: details.uid,
          csrfToken: ctx.request.csrfToken,
          message: maintenance.message ?? translate(cfg.messages, 'maintenance.default_message'),
          brand,
          adminLoginAllowed: true,
          adminLoginNote: translate(cfg.messages, 'maintenance.admin_login_note'),
        })
      }
    }

    if (details.prompt.name === 'consent' && isFirstParty(cfg.branding!, details.params.client_id as string | undefined)) {
      // Clients first-party: auto-concede o consent (pula a tela de consent).
      // interactions.consent monta o Grant + interactionFinished e escreve o
      // redirect de volta para o client — opera via provider.interactionDetails,
      // independente do metodo HTTP, entao funciona no GET show().
      return await service.interactions.consent(ctx)
    }

    if (details.prompt.name !== 'login') {
      // Consent or other prompts — unchanged
      return render(ctx, 'consent', {
        uid: details.uid,
        params: details.params,
        csrfToken: ctx.request.csrfToken,
        brand,
      })
    }

    const email = ctx.session.get(SESSION_KEY) as string | undefined

    // Resolve auth methods (capabilities: magic link, passkey-first, social providers).
    // Capabilities are account-independent at this stage for the identifier step.
    const magicLinkCapableConfig =
      cfg.passwordless.magicLink && supportsMagicLink(cfg.accountStore)
    const configuredSocialProviders: string[] = cfg.social?.providers ?? []
    const authMethodsSettings = runtimeSettingsForMaintenance
    const authMethods = await resolveEffectiveAuthMethods(authMethodsSettings, {
      configuredSocialProviders,
      magicLinkCapable: magicLinkCapableConfig,
      passkeyCapable: false, // passkey-first depends on account — resolved in step 2
    })

    if (!email) {
      // Step 1: identifier (email only).
      // Resolve registration enabled to hide "create account" link when closed.
      const registrationEnabled = await resolveEffectiveRegistration(
        cfg.registration?.enabled ?? true,
        runtimeSettingsForMaintenance
      )
      return render(ctx, 'login', {
        uid: details.uid,
        csrfToken: ctx.request.csrfToken,
        step: 'identifier',
        registrationEnabled,
        brand,
        authMethods,
      })
    }

    // Step 2: password — look up user for personalisation (enumeration-safe: always show step 2)
    const acc = await cfg.accountStore.findByEmail(email)
    const account = acc ? { fullName: acc.name ?? null, globalRoles: acc.globalRoles ?? [] } : null

    // Passwordless: magic link disponível se ligado E o store suporta E auth_methods permite.
    // Passkey-first disponível se ligado, o store suporta, a conta tem passkeys E auth_methods permite.
    const magicLinkAvailable =
      authMethods.magicLink && magicLinkCapableConfig
    const passkeyFirstCapable =
      cfg.passwordless.passkeyFirst && !!acc && (await this.hasPasskeys(cfg, acc.id))
    const passkeyFirstAvailable = authMethods.passkey && passkeyFirstCapable

    // Effective bot protection: may be overridden at runtime via auth_settings.
    const effectiveBot = await resolveEffectiveBotProtection(cfg.botProtection, await getRuntimeSettings(ctx))

    return render(ctx, 'login', {
      uid: details.uid,
      csrfToken: ctx.request.csrfToken,
      step: 'password',
      email,
      account,
      brand,
      magicLinkAvailable,
      passkeyFirstAvailable,
      botProtection: effectiveBot?.on.includes('login') ? effectiveBot.widget : undefined,
      authMethods,
    })
  }

  /**
   * POST /auth/interaction/:uid/identifier
   * Step 1: receive email, store in session, redirect to step 2.
   * ENUMERATION-SAFE: always advances regardless of whether the email exists.
   */
  async identifier(ctx: HttpContext) {
    const { email } = ctx.request.only(['email'])
    ctx.session.put(SESSION_KEY, email)
    return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
  }

  /**
   * POST /auth/interaction/:uid/login
   * Step 2: password submit. Reads email from session (never from form).
   */
  async login(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const email = ctx.session.get(SESSION_KEY) as string | undefined
    if (!email) {
      // Session expired or tampered — send back to step 1
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    const { password } = ctx.request.only(['password'])
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    // Resolve runtime settings (reutilizado por bot + maintenance + verifiedEmail).
    const runtimeSettings = await getRuntimeSettings(ctx)

    // Maintenance mode: verifica se a conta que tenta logar é admin.
    // Admins CONTINUAM podendo logar (senão o operador se tranca fora).
    // A verificação de role acontece APÓS as credenciais (senha correta primeiro).
    const maintenance = await resolveEffectiveMaintenanceMode(runtimeSettings)

    // Effective bot protection: may be overridden at runtime via auth_settings.
    const effectiveBotLogin = await resolveEffectiveBotProtection(cfg.botProtection, runtimeSettings)

    // Bot protection (plugável): valida o token do widget ANTES de tocar nas
    // credenciais. Fail-safe: erro/timeout no verify do host PERMITE o fluxo.
    // We use a cfg-compatible object: pass effectiveBotLogin merged into cfg.
    const cfgWithEffectiveBot = effectiveBotLogin !== cfg.botProtection
      ? { ...cfg, botProtection: effectiveBotLogin }
      : cfg
    if (!(await guardBotProtection(ctx, cfgWithEffectiveBot as any, 'login', { email, clientId }))) {
      const found = await cfg.accountStore.findByEmail(email)
      const account = found
        ? { fullName: found.name ?? null, globalRoles: found.globalRoles ?? [] }
        : null
      return render(ctx, 'login', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        step: 'password',
        email,
        account,
        error: translate(cfg.messages, 'errors.bot_protection_failed'),
        brand,
        botProtection: effectiveBotLogin?.widget,
      })
    }

    // Verificamos as credenciais ANTES de finalizar a interaction, porque com MFA
    // ligado precisamos exigir o 2º fator e NÃO podemos chamar interactionFinished
    // ainda. A sequência verificação + lockout + auditoria de falha é centralizada
    // em attemptPasswordLogin; a renderização (lookup p/ personalização) fica aqui.
    const result = await attemptPasswordLogin(cfg, { email, password, ip, clientId, settings: runtimeSettings })

    if (!result.ok) {
      const found = await cfg.accountStore.findByEmail(email)
      const account = found
        ? { fullName: found.name ?? null, globalRoles: found.globalRoles ?? [] }
        : null
      return render(ctx, 'login', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        step: 'password',
        email,
        account,
        error: result.locked
          ? translate(cfg.messages, 'errors.account_locked', {
              seconds: result.retryAfterSec ?? 0,
            })
          : result.disabled
            ? translate(cfg.messages, 'errors.account_disabled')
            : result.unverified
              ? translate(cfg.messages, 'errors.email_unverified')
              : translate(cfg.messages, 'errors.invalid_credentials'),
        brand,
        botProtection: effectiveBotLogin?.on.includes('login') ? effectiveBotLogin.widget : undefined,
      })
    }

    const acc = result.account

    // Maintenance mode guard: credenciais válidas, mas manutenção ativa.
    // Contas admin (role em cfg.admin.roles) CONTINUAM podendo logar.
    // Contas comuns são bloqueadas com a tela de manutenção.
    if (maintenance.enabled) {
      const adminRoles: string[] = cfg.admin?.roles ?? ['ADMIN']
      const accountRoles: string[] = acc.globalRoles ?? []
      const isAdmin = adminRoles.some((r: string) => accountRoles.includes(r))
      if (!isAdmin) {
        return render(ctx, 'maintenance', {
          uid: details.uid,
          csrfToken: ctx.request.csrfToken,
          message: maintenance.message ?? translate(cfg.messages, 'maintenance.default_message'),
          brand,
          adminLoginAllowed: true,
          adminLoginNote: translate(cfg.messages, 'maintenance.admin_login_note'),
        })
      }
      // Admin: prossegue normalmente (sem bloqueio).
    }

    // Step-up auth (acr_values): o client pode EXIGIR MFA nesta requisição
    // solicitando o `mfaAcr` em acr_values, mesmo que a conta tenha MFA opcional.
    const mfaRequired = this.acrRequiresMfa(cfg, details)

    // MFA gate: força o 2º fator se a conta tem TOTP ativo OU se o client exige MFA
    // via acr. Não finaliza a interaction agora — guarda o accountId pendente.
    const mfa = (await cfg.accountStore.getMfaState?.(acc.id)) ?? { enabled: false }
    if (mfa.enabled || mfaRequired) {
      if (mfaRequired && !mfa.enabled) {
        // Client exige MFA mas a conta não tem MFA enrolado: bloqueia este login
        // com a instrução de configurar MFA no console (não há 2º fator a desafiar).
        return render(ctx, 'mfa-challenge', {
          uid: ctx.request.param('uid'),
          csrfToken: ctx.request.csrfToken,
          brand,
          passkeyAvailable: false,
          error: translate(cfg.messages, 'mfa_challenge.required_no_enrollment'),
          noEnrollment: true,
        })
      }
      // Trusted device: se o mecanismo está ligado, a conta JÁ tem MFA enrolado e
      // o request NÃO é um step-up (que sempre força o MFA), um cookie de confiança
      // válido para ESTA conta pula o 2º fator. amr fica `['pwd']` (sem acr de MFA).
      if (cfg.trustedDevices.enabled && mfa.enabled && !mfaRequired) {
        const trusted = await this.checkTrustedDevice(ctx, acc.id, mfa.enabledAt ?? null)
        if (trusted) {
          await service.interactions.completeLogin(ctx, acc.id, { amr: ['pwd'] })
          await notifyLoginSuccess(ctx, cfg, {
            accountId: acc.id,
            email,
            ip,
            clientId,
            trustedDevice: true,
          })
          ctx.session.forget(SESSION_KEY)
          return
        }
      }

      ctx.session.put(MFA_PENDING_KEY, acc.id)
      // Passkey disponível como alternativa ao TOTP se o store suporta E a conta
      // tem ao menos uma credencial registrada.
      const passkeyAvailable = await this.hasPasskeys(cfg, acc.id)
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        brand,
        passkeyAvailable,
        trustedDevicesEnabled: cfg.trustedDevices.enabled,
        trustedDeviceDays: cfg.trustedDevices.days,
      })
    }

    // Sem MFA: finaliza a interaction (escreve o 303 de volta para o client).
    await service.interactions.completeLogin(ctx, acc.id)
    await notifyLoginSuccess(ctx, cfg, { accountId: acc.id, email, ip, clientId })
    // Clean up the session key after a successful login.
    ctx.session.forget(SESSION_KEY)
  }

  /**
   * POST /auth/interaction/:uid/mfa
   * 2º fator: lê o accountId pendente da sessão e aceita um código TOTP (`code`)
   * OU um recovery code (`recoveryCode`). Em caso de sucesso finaliza a interaction.
   */
  async mfaVerify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const accountId = ctx.session.get(MFA_PENDING_KEY) as string | undefined
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    if (!accountId) {
      // Sessão expirou/foi adulterada — volta ao início do login.
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    const { code, recoveryCode } = ctx.request.only(['code', 'recoveryCode'])

    let ok = false
    let usedRecovery = false
    if (recoveryCode) {
      ok = (await cfg.accountStore.consumeRecoveryCode?.(accountId, recoveryCode)) ?? false
      usedRecovery = ok
    } else if (code) {
      ok = (await cfg.accountStore.verifyTotp?.(accountId, code)) ?? false
    }

    if (!ok) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId,
        ip,
        clientId,
        metadata: { stage: 'mfa' },
      })
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.invalid_code'),
        brand,
        passkeyAvailable: await this.hasPasskeys(cfg, accountId),
        trustedDevicesEnabled: cfg.trustedDevices.enabled,
        trustedDeviceDays: cfg.trustedDevices.days,
      })
    }

    // Sucesso no 2º fator: opcionalmente confia neste dispositivo (checkbox).
    await this.maybeTrustDevice(ctx, cfg, accountId)
    // Finaliza a interaction para o accountId pendente.
    ctx.session.forget(MFA_PENDING_KEY)
    ctx.session.forget(SESSION_KEY)
    await notifyLoginSuccess(ctx, cfg, {
      accountId,
      ip,
      clientId,
      metadata: { mfa: usedRecovery ? 'recovery' : 'totp' },
    })
    // Step-up: um 2º fator foi de fato verificado — carimba acr/amr no id_token
    // se o client solicitou o mfaAcr nesta requisição.
    await service.interactions.completeLogin(
      ctx,
      accountId,
      this.stepUpExtra(cfg, details, usedRecovery ? 'recovery' : 'totp')
    )
  }

  /**
   * true se o authorize request exige MFA via acr_values (contém o mfaAcr da
   * config de step-up). `acr_values` é a string separada por espaços padrão OIDC.
   */
  private acrRequiresMfa(cfg: any, details: any): boolean {
    const mfaAcr = cfg.stepUp?.mfaAcr as string | undefined
    if (!mfaAcr) return false
    const raw = details?.params?.acr_values
    if (typeof raw !== 'string' || !raw) return false
    return raw.split(/\s+/).includes(mfaAcr)
  }

  /**
   * Monta o acr/amr do step-up quando o client solicitou o mfaAcr e um 2º fator
   * foi verificado. `method` é o método do segundo fator (totp/recovery/webauthn).
   * Retorna `undefined` quando não há step-up — completeLogin usa o default.
   */
  private stepUpExtra(
    cfg: any,
    details: any,
    method: string
  ): { acr: string; amr: string[] } | undefined {
    if (!this.acrRequiresMfa(cfg, details)) return undefined
    return { acr: cfg.stepUp.mfaAcr, amr: ['mfa', method] }
  }

  /** true se o store suporta passkeys E a conta tem ao menos uma registrada. */
  private async hasPasskeys(cfg: any, accountId: string): Promise<boolean> {
    if (!supportsPasskeys(cfg.accountStore)) return false
    const list = await cfg.accountStore.listPasskeys(accountId)
    return Array.isArray(list) && list.length > 0
  }

  /**
   * Lê o cookie de dispositivo confiável (encriptado, appKey-backed) e valida que
   * pertence a `accountId`, não expirou e é posterior ao último (re)enrollment de
   * MFA. Step-up NÃO chama isto (força sempre o MFA). Best-effort: qualquer erro de
   * leitura → não confiável.
   */
  private async checkTrustedDevice(
    ctx: HttpContext,
    accountId: string,
    mfaEnabledAt: number | null
  ): Promise<boolean> {
    try {
      const payload = ctx.request.encryptedCookie(TRUSTED_DEVICE_COOKIE)
      return isTrustedDeviceValid(payload, { accountId, mfaEnabledAt })
    } catch {
      return false
    }
  }

  /**
   * Se o checkbox "confiar neste dispositivo" foi marcado E o mecanismo está ligado,
   * grava o cookie encriptado de confiança para a conta (skip MFA por N dias).
   */
  private async maybeTrustDevice(ctx: HttpContext, cfg: any, accountId: string): Promise<void> {
    if (!cfg.trustedDevices.enabled) return
    const checked = ctx.request.input('trustDevice')
    // Checkbox HTML: presente ('on'/'true'/'1') = marcado.
    const on = checked === 'on' || checked === 'true' || checked === '1' || checked === true
    if (!on) return
    const payload = buildTrustedDevicePayload(accountId, cfg.trustedDevices)
    ctx.response.encryptedCookie(TRUSTED_DEVICE_COOKIE, payload, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: cfg.trustedDevices.days * 24 * 60 * 60,
    })
  }

  /**
   * accountId para uma cerimônia de passkey no login. Prioriza o accountId pendente
   * do MFA (passkey como 2º fator). Quando ausente e o passkey-first está ligado,
   * resolve a conta pelo e-mail guardado na sessão (passkey ANTES da senha) — só se
   * a conta existe E tem ao menos uma passkey.
   */
  private async resolvePasskeyAccountId(ctx: HttpContext, cfg: any): Promise<string | undefined> {
    const pending = ctx.session.get(MFA_PENDING_KEY) as string | undefined
    if (pending) return pending
    if (!cfg.passwordless?.passkeyFirst) return undefined
    const email = ctx.session.get(SESSION_KEY) as string | undefined
    if (!email) return undefined
    const acc = await cfg.accountStore.findByEmail(email)
    if (!acc) return undefined
    return (await this.hasPasskeys(cfg, acc.id)) ? acc.id : undefined
  }

  /**
   * POST /auth/interaction/:uid/magic
   * Magic link: lê o e-mail da sessão (passwordless.magicLink ligado), emite um
   * token de uso único e dispara o e-mail. SEMPRE renderiza "link enviado",
   * independentemente de a conta existir (anti-enumeração). Throttled como o login.
   */
  async magicLinkRequest(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const email = ctx.session.get(SESSION_KEY) as string | undefined
    const uid = ctx.request.param('uid')

    if (cfg.passwordless.magicLink && supportsMagicLink(cfg.accountStore) && email) {
      const issued = await cfg.accountStore.issueMagicLinkToken(email)
      if (issued) {
        await cfg.audit?.record({
          type: 'login.magic_link_sent',
          accountId: issued.account.id,
          email,
          ip: ctx.request.ip?.() ?? null,
          clientId: (details.params.client_id as string | undefined) ?? null,
        })
        const origin = `${ctx.request.protocol()}://${ctx.request.host()}`
        const magicUrl = `${origin}/auth/interaction/${uid}/magic?token=${encodeURIComponent(issued.token)}`
        if (cfg.mail?.onMagicLink) {
          await cfg.mail.onMagicLink({ email, magicUrl, token: issued.token })
        } else {
          await sendMagicLinkEmail(ctx, { email, magicUrl })
        }
      }
    }

    // Resposta uniforme (não vaza existência de conta).
    return render(ctx, 'login', {
      uid,
      csrfToken: ctx.request.csrfToken,
      step: 'password',
      email,
      account: null,
      brand,
      magicLinkSent: true,
    })
  }

  /**
   * GET /auth/interaction/:uid/magic?token=...
   * Consome o magic link. Em sucesso finaliza o login (amr `['email']`). Token
   * inválido/expirado volta ao início do login.
   */
  async magicLinkConsume(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const uid = ctx.request.param('uid')
    const ip = ctx.request.ip?.() ?? null
    const clientId = (await service.interactions.details(ctx)).params.client_id as string | undefined

    const token = (ctx.request.qs().token as string) ?? ''
    if (!cfg.passwordless.magicLink || !supportsMagicLink(cfg.accountStore) || !token) {
      return ctx.response.redirect(`/auth/interaction/${uid}`)
    }
    const acc = await cfg.accountStore.consumeMagicLinkToken(token)
    if (!acc) {
      await cfg.audit?.record({ type: 'login.failure', ip, clientId, metadata: { stage: 'magic_link' } })
      return ctx.response.redirect(`/auth/interaction/${uid}`)
    }
    // E-mail não verificado (LGPD/compliance): mesmo com o link válido, não
    // materializa a sessão se a política exige verificação. Volta ao login com erro.
    const magicLinkRuntimeSettings = await getRuntimeSettings(ctx)
    if (await isEmailUnverifiedBlock(cfg, acc.id, magicLinkRuntimeSettings)) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId: acc.id,
        email: acc.email,
        ip,
        clientId,
        metadata: { stage: 'magic_link', reason: 'unverified' },
      })
      const render = cfg.render!
      return render(ctx, 'login', {
        uid,
        csrfToken: ctx.request.csrfToken,
        step: 'password',
        email: acc.email,
        account: null,
        brand: brandFor(cfg.branding!, clientId ?? undefined, undefined),
        error: translate(cfg.messages, 'errors.email_unverified'),
      })
    }
    await notifyLoginSuccess(ctx, cfg, {
      accountId: acc.id,
      email: acc.email,
      ip,
      clientId: clientId ?? null,
      metadata: { method: 'magic_link' },
    })
    ctx.session.forget(SESSION_KEY)
    await service.interactions.completeLogin(ctx, acc.id, { amr: ['email'] })
  }

  /**
   * POST /auth/interaction/:uid/passkey/options
   * Gera as opções de autenticação por passkey para o accountId pendente do MFA,
   * guarda o challenge na sessão e devolve as opções JSON para o browser.
   */
  async passkeyOptions(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const accountId = await this.resolvePasskeyAccountId(ctx, cfg)
    if (!accountId) {
      return ctx.response.badRequest({
        message: translate(cfg.messages, 'errors.session_expired'),
      })
    }
    const generated = await cfg.accountStore.generatePasskeyAuthenticationOptions?.(accountId)
    if (!generated) {
      return ctx.response.notFound({
        message: translate(cfg.messages, 'errors.no_passkey_registered'),
      })
    }
    ctx.session.put(PASSKEY_AUTH_CHALLENGE_KEY, generated.challenge)
    return generated.options
  }

  /**
   * POST /auth/interaction/:uid/passkey/verify
   * Verifica a resposta de autenticação por passkey contra o challenge guardado;
   * em caso de sucesso FINALIZA a interaction (303 de volta ao client — alternativa
   * ao código TOTP). É um POST de página inteira (form), não fetch: o browser
   * submete o JSON da assertion no campo `response` e segue o redirect normalmente.
   */
  async passkeyVerify(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    const cfg = service.config
    const render = cfg.render!
    const details = await service.interactions.details(ctx)
    const brand = brandFor(
      cfg.branding!,
      details.params.client_id as string | undefined,
      details.params.audience as string | undefined
    )
    const accountId = await this.resolvePasskeyAccountId(ctx, cfg)
    const challenge = ctx.session.get(PASSKEY_AUTH_CHALLENGE_KEY) as string | undefined
    const ip = ctx.request.ip?.() ?? null
    const clientId = (details.params.client_id as string | undefined) ?? null

    if (!accountId || !challenge) {
      // Sessão expirou/foi adulterada — volta ao início do login.
      return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
    }

    // A assertion vem serializada como JSON no campo `response` do form.
    const raw = ctx.request.input('response') as string | undefined
    let parsed: unknown = null
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      parsed = null
    }
    const ok = parsed
      ? ((await cfg.accountStore.verifyPasskeyAuthentication?.(accountId, parsed, challenge)) ?? false)
      : false
    ctx.session.forget(PASSKEY_AUTH_CHALLENGE_KEY)

    if (!ok) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId,
        ip,
        clientId,
        metadata: { stage: 'mfa', method: 'webauthn' },
      })
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'mfa_challenge.passkey_error'),
        brand,
        passkeyAvailable: await this.hasPasskeys(cfg, accountId),
        trustedDevicesEnabled: cfg.trustedDevices.enabled,
        trustedDeviceDays: cfg.trustedDevices.days,
      })
    }

    // E-mail não verificado (LGPD/compliance): bloqueia mesmo com a passkey válida.
    // Relevante sobretudo no passkey-first (a etapa de senha — que também checa —
    // não rodou). Volta à tela de desafio com o erro.
    const passkeyRuntimeSettings = await getRuntimeSettings(ctx)
    if (await isEmailUnverifiedBlock(cfg, accountId, passkeyRuntimeSettings)) {
      await cfg.audit?.record({
        type: 'login.failure',
        accountId,
        ip,
        clientId,
        metadata: { stage: 'mfa', method: 'webauthn', reason: 'unverified' },
      })
      return render(ctx, 'mfa-challenge', {
        uid: ctx.request.param('uid'),
        csrfToken: ctx.request.csrfToken,
        error: translate(cfg.messages, 'errors.email_unverified'),
        brand,
        passkeyAvailable: await this.hasPasskeys(cfg, accountId),
        trustedDevicesEnabled: cfg.trustedDevices.enabled,
        trustedDeviceDays: cfg.trustedDevices.days,
      })
    }

    // Passkey OK: opcionalmente confia neste dispositivo (checkbox no challenge).
    await this.maybeTrustDevice(ctx, cfg, accountId)
    ctx.session.forget(MFA_PENDING_KEY)
    ctx.session.forget(SESSION_KEY)
    await notifyLoginSuccess(ctx, cfg, {
      accountId,
      ip,
      clientId,
      metadata: { mfa: 'webauthn' },
    })
    // Step-up carimba acr/amr quando solicitado; senão a passkey conta como o fator
    // forte do login (amr `['webauthn']`) — vale tanto p/ MFA quanto passkey-first.
    await service.interactions.completeLogin(
      ctx,
      accountId,
      this.stepUpExtra(cfg, details, 'webauthn') ?? { amr: ['webauthn'] }
    )
  }

  /**
   * GET /auth/interaction/:uid/switch
   * Clears the stored email and redirects back to step 1.
   */
  async switchIdentifier(ctx: HttpContext) {
    ctx.session.forget(SESSION_KEY)
    return ctx.response.redirect(`/auth/interaction/${ctx.request.param('uid')}`)
  }

  async consent(ctx: HttpContext) {
    const service = await ctx.containerResolver.make('authkit.server')
    await service.interactions.consent(ctx)
  }
}
