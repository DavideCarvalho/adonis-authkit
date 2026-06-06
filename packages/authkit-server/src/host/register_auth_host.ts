import type { Router } from '@adonisjs/core/http'
import type { AuthSocialConfig, RateLimitConfigInput } from '../define_config.js'
import { resolveRateLimit } from '../define_config.js'
import { createAuthThrottles } from './rate_limit.js'
import { ACCOUNT_SESSION_KEY } from './middleware/account_auth.js'
import { adminApiGuard } from './admin_api/admin_api_guard.js'
import {
  setAdminPrefix,
  normalizeAdminPrefix,
  setAdminApiPrefix,
  normalizeAdminApiPrefix,
} from './admin_prefix.js'
import { RuntimeSettings } from './runtime_settings.js'
import { resolveEffectiveSessionPolicy } from './runtime_toggles.js'

/** Chave da sessão Adonis que registra o timestamp da última atividade (idle timeout). */
export const ACCOUNT_LAST_SEEN_KEY = 'authkit_last_seen'

/**
 * Verifica o idle timeout da sessão do console de conta. Lê `idleTimeoutMinutes`
 * da setting `session_policy` (runtime, fail-safe). Se a sessão excedeu o idle,
 * apaga a sessão e retorna true (caller deve redirecionar ao login).
 *
 * Sempre atualiza `authkit_last_seen` quando o idle não foi excedido.
 *
 * FAIL-SAFE: qualquer erro → nunca encerra a sessão (disponibilidade > segurança).
 */
async function checkAndRefreshIdle(ctx: any): Promise<boolean> {
  try {
    const db = await ctx.containerResolver?.make?.('lucid.db')
    if (!db) return false
    const runtimeSettings = new RuntimeSettings(db)
    const policy = await resolveEffectiveSessionPolicy(runtimeSettings)
    const idleMs = policy.idleTimeoutMinutes * 60 * 1000
    if (idleMs <= 0) return false // idle desligado

    const lastSeen = ctx.session?.get(ACCOUNT_LAST_SEEN_KEY) as number | undefined
    const now = Date.now()
    if (lastSeen !== undefined && now - lastSeen > idleMs) {
      // Idle excedido: encerra a sessão.
      ctx.session?.forget(ACCOUNT_SESSION_KEY)
      ctx.session?.forget(ACCOUNT_LAST_SEEN_KEY)
      return true
    }
    // Atualiza o timestamp de última atividade.
    ctx.session?.put(ACCOUNT_LAST_SEEN_KEY, now)
    return false
  } catch {
    // FAIL-SAFE: nunca encerra a sessão em caso de erro.
    return false
  }
}

/**
 * Guard inline do console de conta. Usamos uma closure (forma confiável do
 * `.use()` do AdonisJS) em vez de `() => import(middleware)` — a forma lazy de
 * classe NÃO era aplicada em runtime num grupo, deixando /account/tokens e
 * /account/mfa acessíveis sem sessão.
 */
const accountGuard = async (ctx: any, next: () => Promise<void>) => {
  if (!ctx.session?.get(ACCOUNT_SESSION_KEY)) {
    return ctx.response.redirect('/account/login')
  }
  // Idle timeout: encerra e redireciona com query param de motivo.
  const idleExpired = await checkAndRefreshIdle(ctx)
  if (idleExpired) {
    return ctx.response.redirect('/account/login?reason=idle')
  }
  return next()
}

/**
 * Guard do console admin (B6). Como o `accountGuard`, é uma closure inline (forma
 * confiável do `.use()` num grupo). Exige:
 *   0. `config.admin.enabled` ligado (senão → 404; ver nota de flag-drift abaixo);
 *   1. sessão de conta ativa (senão → /account/login);
 *   2. a conta logada com pelo menos UMA das `config.admin.roles` nas roles globais
 *      (senão → /account/tokens, evitando vazar a existência do /admin).
 * As roles permitidas são resolvidas em runtime do `authkit.server` (config lazy).
 */
export const adminGuard = async (ctx: any, next: () => Promise<void>) => {
  const service = await ctx.containerResolver.make('authkit.server')
  const cfg = service.config
  // Defesa contra flag-drift: as rotas são montadas com `admin: true` em tempo de
  // registro, ANTES de o config resolver. Se o config tiver `admin.enabled: false`,
  // as rotas existem mas o console deve estar desligado — 404 (não vaza a existência).
  if (!cfg.admin.enabled) {
    return ctx.response.notFound()
  }
  const accountId = ctx.session?.get(ACCOUNT_SESSION_KEY) as string | undefined
  if (!accountId) {
    // `/account/login` é sempre o login da conta — NÃO muda com o prefixo admin.
    return ctx.response.redirect('/account/login')
  }
  // Idle timeout: também protege o console admin.
  const idleExpired = await checkAndRefreshIdle(ctx)
  if (idleExpired) {
    return ctx.response.redirect('/account/login?reason=idle')
  }
  const allowed = cfg.admin.roles as string[]
  const account = await cfg.accountStore.findById(accountId)
  const roles = account?.globalRoles ?? []
  const isAdmin = roles.some((r: string) => allowed.includes(r))
  if (!isAdmin) {
    // Evita vazar a existência do console admin: redireciona para a página de
    // tokens da conta (sem mostrar a URL do admin).
    return ctx.response.redirect('/account/tokens')
  }
  return next()
}

/**
 * Opções de montagem das rotas do host-kit.
 *
 * NOTA (flag-drift): vários campos aqui (`social`, `rateLimit`, `admin`) ESPELHAM
 * o config (`config/authkit.ts`) porque a decisão de MONTAR as rotas acontece em
 * tempo de registro, antes de o config (lazy) resolver. Eles controlam apenas se
 * as rotas existem; a fonte de verdade do COMPORTAMENTO continua sendo o config
 * resolvido. Se um flag aqui divergir do config (ex.: `admin: true` aqui com
 * `admin.enabled: false` no config), os guards das rotas são a rede de segurança
 * (o `adminGuard` 404a quando `config.admin.enabled` é false). Mantenha-os em
 * sincronia; os guards garantem que a divergência não vire um bypass.
 */
export interface AuthHostOptions {
  /** Onde o provider OIDC é montado (default '/oidc'). Deve casar com o final do issuer. */
  mountPath: string
  /**
   * Login social opt-in; quando presente, monta as rotas sociais (usam ctx.ally).
   * Necessário aqui (e não só no config) porque a decisão de montar as rotas é
   * tomada em tempo de registro, antes do config (lazy) resolver.
   */
  social?: AuthSocialConfig
  /**
   * Rate-limiting (anti-brute-force) das rotas sensíveis. Necessário aqui (e não
   * só no config) porque a aplicação do throttle acontece em tempo de registro de
   * rota. Ligado por default (mesma resolução do config). Espelhe o `rateLimit` de
   * config/authkit.ts. Se `@adonisjs/limiter` não estiver configurado no host
   * (config/limiter.ts), o throttle vira no-op (fail-safe).
   */
  rateLimit?: RateLimitConfigInput
  /**
   * Console admin opt-in (B6).
   *
   * - `true` → comportamento padrão: monta as rotas sob o prefixo `/admin` (back-compat total).
   * - `{ prefix?: string }` → monta sob o prefixo fornecido, e.g. `{ prefix: '/auth/admin' }`.
   *   O prefixo é normalizado: começa com `/`, sem trailing slash.
   *   Quando `prefix` é omitido ou vazio, usa o default `/admin`.
   *
   * Necessário aqui (e não só no config) porque a decisão de montar as rotas é
   * tomada em tempo de registro, antes do config (lazy) resolver.
   * Espelhe o `admin.enabled` de config/authkit.ts.
   *
   * @example
   * // Prefixo padrão (back-compat)
   * registerAuthHost(router, { mountPath: '/oidc', admin: true })
   *
   * // Prefixo customizado — console em /auth/admin
   * registerAuthHost(router, { mountPath: '/oidc', admin: { prefix: '/auth/admin' } })
   */
  admin?: boolean | { prefix?: string }
  /**
   * Admin REST API opt-in (R6).
   *
   * - `true` → comportamento padrão: monta o grupo sob `/api/authkit/v1` (back-compat total).
   * - `{ prefix?: string }` → monta sob o prefixo fornecido, e.g. `{ prefix: '/authkit/api' }`.
   *   O prefixo é normalizado: começa com `/`, sem trailing slash.
   *   Quando `prefix` é omitido ou vazio, usa o default `/api/authkit/v1`.
   *
   * Necessário aqui (e não só no config) porque a decisão de montar as rotas é
   * tomada em tempo de registro, antes do config (lazy) resolver.
   * Espelhe o `adminApi.enabled` de config/authkit.ts.
   *
   * @example
   * // Prefixo padrão (back-compat)
   * registerAuthHost(router, { mountPath: '/oidc', adminApi: true })
   *
   * // Prefixo customizado — API em /authkit/api
   * registerAuthHost(router, { mountPath: '/oidc', adminApi: { prefix: '/authkit/api' } })
   */
  adminApi?: boolean | { prefix?: string }
}

const C = {
  oidc: () => import('../controllers/oidc_callback_controller.js'),
  interaction: () => import('./controllers/interaction_controller.js'),
  registration: () => import('./controllers/registration_controller.js'),
  social: () => import('./controllers/social_controller.js'),
  patIntrospection: () => import('./controllers/pat_introspection_controller.js'),
  accountSession: () => import('./controllers/account_session_controller.js'),
  accountTokens: () => import('./controllers/account_tokens_controller.js'),
  accountSecurity: () => import('./controllers/account_security_controller.js'),
  accountApps: () => import('./controllers/account_apps_controller.js'),
  accountMfa: () => import('./controllers/account_mfa_controller.js'),
  accountOrgs: () => import('./controllers/account_orgs_controller.js'),
  adminDashboard: () => import('./controllers/admin/admin_dashboard_controller.js'),
  adminUsers: () => import('./controllers/admin/admin_users_controller.js'),
  adminSessions: () => import('./controllers/admin/admin_sessions_controller.js'),
  adminClients: () => import('./controllers/admin/admin_clients_controller.js'),
  adminAudit: () => import('./controllers/admin/admin_audit_controller.js'),
  adminOrgs: () => import('./controllers/admin/admin_orgs_controller.js'),
  adminSettings: () => import('./controllers/admin/admin_settings_controller.js'),
  apiUsers: () => import('./admin_api/api_users_controller.js'),
  apiClients: () => import('./admin_api/api_clients_controller.js'),
  apiMisc: () => import('./admin_api/api_misc_controller.js'),
  apiOrgs: () => import('./admin_api/api_orgs_controller.js'),
  apiSettings: () => import('./admin_api/api_settings_controller.js'),
}

/**
 * Monta todas as rotas do host-kit do Authorization Server numa chamada.
 * Substitui registerOidcRoutes + o hand-wiring do start/routes.ts do host.
 */
export function registerAuthHost(router: Router, opts: AuthHostOptions): void {
  const mount = opts.mountPath

  // Throttles opt-in (anti-brute-force). `undefined` quando rate-limit desligado.
  const throttles = createAuthThrottles(resolveRateLimit(opts.rateLimit))
  // Helpers: aplicam o middleware de throttle quando presente; senão no-op.
  const withLogin = (route: any): void => {
    if (throttles) route.use([throttles.login])
  }
  const withIntrospection = (route: ReturnType<Router['post']>): void => {
    if (throttles) route.use([throttles.introspection])
  }

  // Provider OIDC (wildcard + root) — o que registerOidcRoutes fazia.
  router.any(`${mount}/*`, [C.oidc]).as('authkit.oidc.wildcard')
  router.any(mount, [C.oidc]).as('authkit.oidc.root')

  // Interaction (login multi-step + consent + signup).
  router.get('/auth/interaction/:uid', [C.interaction, 'show'])
  router.post('/auth/interaction/:uid/identifier', [C.interaction, 'identifier'])
  withLogin(router.post('/auth/interaction/:uid/login', [C.interaction, 'login']))
  withLogin(router.post('/auth/interaction/:uid/mfa', [C.interaction, 'mfaVerify']))
  // Troca de senha obrigatória quando a senha expirou (password expiration gate).
  withLogin(router.post('/auth/interaction/:uid/password-expired', [C.interaction, 'changeExpiredPassword']))
  // Passkey como 2º fator alternativo no login (begin/finish; challenge na sessão).
  router.post('/auth/interaction/:uid/passkey/options', [C.interaction, 'passkeyOptions'])
  withLogin(router.post('/auth/interaction/:uid/passkey/verify', [C.interaction, 'passkeyVerify']))
  // Magic link (passwordless): POST emite (throttled), GET consome o token do link.
  withLogin(router.post('/auth/interaction/:uid/magic', [C.interaction, 'magicLinkRequest']))
  router.get('/auth/interaction/:uid/magic', [C.interaction, 'magicLinkConsume'])
  router.post('/auth/interaction/:uid/consent', [C.interaction, 'consent'])
  router.get('/auth/interaction/:uid/switch', [C.interaction, 'switchIdentifier'])
  router.get('/auth/interaction/:uid/signup', [C.registration, 'showSignup'])
  withLogin(router.post('/auth/interaction/:uid/signup', [C.registration, 'signup']))

  // Recuperação de senha (standalone).
  router.get('/auth/forgot-password', [C.registration, 'showForgot'])
  withLogin(router.post('/auth/forgot-password', [C.registration, 'forgot']))
  router.get('/auth/reset-password', [C.registration, 'showReset'])
  withLogin(router.post('/auth/reset-password', [C.registration, 'reset']))

  // Verificação de e-mail (standalone, GET-only — consome o token do link).
  router.get('/auth/verify-email', [C.registration, 'verifyEmail'])

  // Login social (opt-in).
  if (opts.social) {
    router.get('/auth/:provider/redirect/:uid', [C.social, 'redirect'])
    router.get('/auth/:provider/callback', [C.social, 'callback'])
  }

  // PAT introspection (server-to-server).
  withIntrospection(router.post('/authkit/pat/introspect', [C.patIntrospection, 'handle']))

  // Organizations — invitation accept (sem guard: controller lida com não-autenticado).
  router.get('/account/orgs/invitations/:token/accept', [C.accountOrgs, 'showAcceptInvitation'])
  router.post('/account/orgs/invitations/:token/accept', [C.accountOrgs, 'acceptInvitation'])

  // Console de conta (login de sessão do IdP + gerência de PAT).
  router.get('/account/login', [C.accountSession, 'show'])
  router.post('/account/login', [C.accountSession, 'login'])
  router.post('/account/logout', [C.accountSession, 'logout'])

  // Confirmação de troca de e-mail (standalone, GET-only — consome o token do link;
  // pode ser aberta em outro dispositivo, então NÃO exige sessão).
  router.get('/account/email/confirm', [C.accountSecurity, 'confirmEmail'])

  // Rotas de tokens protegidas por AccountAuthMiddleware (redireciona para /account/login se não autenticado).
  router
    .group(() => {
      router.get('/account/tokens', [C.accountTokens, 'index'])
      router.post('/account/tokens', [C.accountTokens, 'store'])
      router.post('/account/tokens/:id/revoke', [C.accountTokens, 'destroy'])

      // Segurança da conta: trocar senha + solicitar troca de e-mail + perfil.
      router.get('/account/security', [C.accountSecurity, 'index'])
      router.post('/account/security/password', [C.accountSecurity, 'changePassword'])
      router.post('/account/security/email', [C.accountSecurity, 'changeEmail'])
      router.post('/account/security/email/cancel', [C.accountSecurity, 'cancelEmailChange'])
      router.post('/account/security/profile', [C.accountSecurity, 'updateProfile'])
      // LGPD/GDPR: export de dados (portabilidade) + deleção self-service (danger zone).
      // O export carrega o throttle de login (anti-abuso) quando o rate-limit existe.
      withLogin(router.get('/account/security/export', [C.accountSecurity, 'exportData']))
      router.post('/account/security/delete', [C.accountSecurity, 'deleteAccount'])
      // Trusted devices: limpa o cookie de confiança DESTE navegador.
      router.post('/account/security/trusted-devices/revoke', [
        C.accountSecurity,
        'revokeTrustedDevices',
      ])

      // Apps com acesso (consentimento): lista os grants da conta + revogação por client.
      router.get('/account/apps', [C.accountApps, 'index'])
      router.post('/account/apps/:clientId/revoke', [C.accountApps, 'revoke'])

      // MFA / TOTP (enrollment, confirmação, disable).
      router.get('/account/mfa', [C.accountMfa, 'index'])
      router.post('/account/mfa/enroll', [C.accountMfa, 'enroll'])
      router.post('/account/mfa/confirm', [C.accountMfa, 'confirm'])
      router.post('/account/mfa/disable', [C.accountMfa, 'disable'])

      // MFA / WebAuthn (passkeys): registro (begin/finish) + remoção.
      router.post('/account/mfa/passkeys/options', [C.accountMfa, 'passkeyRegisterOptions'])
      router.post('/account/mfa/passkeys/verify', [C.accountMfa, 'passkeyRegisterVerify'])
      router.post('/account/mfa/passkeys/:id/remove', [C.accountMfa, 'passkeyRemove'])

      // Organizations (multi-tenancy) — sempre montadas; controller retorna 404/403 sem tabelas.
      router.get('/account/orgs', [C.accountOrgs, 'index'])
      router.post('/account/orgs', [C.accountOrgs, 'store'])
      router.post('/account/orgs/deactivate', [C.accountOrgs, 'deactivate'])
      router.post('/account/orgs/:id/activate', [C.accountOrgs, 'activate'])
      router.post('/account/orgs/:id/leave', [C.accountOrgs, 'leave'])
      router.post('/account/orgs/:id/invite', [C.accountOrgs, 'invite'])
      router.post('/account/orgs/:id/members/:accountId/remove', [C.accountOrgs, 'removeMember'])
      router.post('/account/orgs/:id/invitations/:invId/revoke', [C.accountOrgs, 'revokeInvitation'])
      // JSON endpoints for React hooks (authkit-react).
      router.get('/account/orgs/json', [C.accountOrgs, 'listJson'])
      router.get('/account/orgs/invitations/json', [C.accountOrgs, 'listInvitationsJson'])
      router.get('/account/orgs/:id/json', [C.accountOrgs, 'showJson'])
    })
    .use([accountGuard])

  // Console admin (opt-in — B6). Protegido pelo adminGuard (sessão + role global).
  if (opts.admin) {
    // Resolve o prefixo: `true` → '/admin' (default); objeto → usa prefix fornecido.
    const rawPrefix =
      typeof opts.admin === 'object' && opts.admin.prefix ? opts.admin.prefix : '/admin'
    const ap = normalizeAdminPrefix(rawPrefix)
    // Persiste no singleton de processo para que controllers e views usem o mesmo prefixo.
    setAdminPrefix(ap)

    router
      .group(() => {
        router.get(ap, [C.adminDashboard, 'index'])
        router.get(`${ap}/users`, [C.adminUsers, 'index'])
        router.post(`${ap}/users`, [C.adminUsers, 'store'])
        router.post(`${ap}/users/:id/roles`, [C.adminUsers, 'updateRoles'])
        router.post(`${ap}/users/:id/reset-password`, [C.adminUsers, 'resetPassword'])
        router.post(`${ap}/users/:id/disable`, [C.adminUsers, 'disable'])
        router.post(`${ap}/users/:id/enable`, [C.adminUsers, 'enable'])
        router.post(`${ap}/users/:id/delete`, [C.adminUsers, 'destroy'])
        // Sessões/grants ativos da conta + revogação em massa.
        router.get(`${ap}/users/:id/sessions`, [C.adminSessions, 'index'])
        router.post(`${ap}/users/:id/revoke-sessions`, [C.adminSessions, 'revoke'])
        router.get(`${ap}/clients`, [C.adminClients, 'index'])
        // CRUD de clients OIDC (adapter-backed). `/new` ANTES de `:id` p/ não casar
        // "new" como id; todas as escritas são POST (com _csrf na view).
        router.get(`${ap}/clients/new`, [C.adminClients, 'create'])
        router.post(`${ap}/clients`, [C.adminClients, 'store'])
        router.get(`${ap}/clients/:id/edit`, [C.adminClients, 'edit'])
        router.post(`${ap}/clients/:id/edit`, [C.adminClients, 'update'])
        router.post(`${ap}/clients/:id/regenerate-secret`, [C.adminClients, 'regenerateSecret'])
        router.post(`${ap}/clients/:id/delete`, [C.adminClients, 'destroy'])
        router.get(`${ap}/audit`, [C.adminAudit, 'index'])
        // Organizations (opt-in — capability-gated inside the controller).
        router.get(`${ap}/orgs`, [C.adminOrgs, 'index'])
        router.post(`${ap}/orgs`, [C.adminOrgs, 'store'])
        router.get(`${ap}/orgs/:id`, [C.adminOrgs, 'show'])
        router.post(`${ap}/orgs/:id/delete`, [C.adminOrgs, 'destroy'])
        router.post(`${ap}/orgs/:id/members`, [C.adminOrgs, 'addMember'])
        router.post(`${ap}/orgs/:id/members/:accountId/remove`, [C.adminOrgs, 'removeMember'])
        router.post(`${ap}/orgs/:id/invitations/:invId/revoke`, [C.adminOrgs, 'revokeInvitation'])
        // Runtime settings.
        router.get(`${ap}/settings`, [C.adminSettings, 'index'])
        router.post(`${ap}/settings/bot-protection`, [C.adminSettings, 'updateBotProtection'])
        router.post(`${ap}/settings/bot-protection/reset`, [C.adminSettings, 'resetBotProtection'])
        router.post(`${ap}/settings/registration`, [C.adminSettings, 'updateRegistration'])
        router.post(`${ap}/settings/registration/reset`, [C.adminSettings, 'resetRegistration'])
        router.post(`${ap}/settings/require-verified-email`, [C.adminSettings, 'updateRequireVerifiedEmail'])
        router.post(`${ap}/settings/require-verified-email/reset`, [C.adminSettings, 'resetRequireVerifiedEmail'])
        router.post(`${ap}/settings/maintenance`, [C.adminSettings, 'updateMaintenance'])
        router.post(`${ap}/settings/maintenance/reset`, [C.adminSettings, 'resetMaintenance'])
        router.post(`${ap}/settings/auth-methods`, [C.adminSettings, 'updateAuthMethods'])
        router.post(`${ap}/settings/auth-methods/reset`, [C.adminSettings, 'resetAuthMethods'])
        router.post(`${ap}/settings/email-change`, [C.adminSettings, 'updateEmailChange'])
        router.post(`${ap}/settings/email-change/reset`, [C.adminSettings, 'resetEmailChange'])
        router.post(`${ap}/settings/security-notifications`, [C.adminSettings, 'updateSecurityNotifications'])
        router.post(`${ap}/settings/security-notifications/reset`, [C.adminSettings, 'resetSecurityNotifications'])
        router.post(`${ap}/settings/password-history`, [C.adminSettings, 'updatePasswordHistory'])
        router.post(`${ap}/settings/password-history/reset`, [C.adminSettings, 'resetPasswordHistory'])
        router.post(`${ap}/settings/password-expiration`, [C.adminSettings, 'updatePasswordExpiration'])
        router.post(`${ap}/settings/password-expiration/reset`, [C.adminSettings, 'resetPasswordExpiration'])
        router.post(`${ap}/settings/session-policy`, [C.adminSettings, 'updateSessionPolicy'])
        router.post(`${ap}/settings/session-policy/reset`, [C.adminSettings, 'resetSessionPolicy'])
      })
      .use([adminGuard])
  }

  // Admin REST API (opt-in — R6). Superfície machine-to-machine atrás do
  // adminApiGuard (API key). Todas as rotas levam o throttle de introspecção.
  if (opts.adminApi) {
    // Resolve o prefixo: `true` → '/api/authkit/v1' (default); objeto → usa prefix fornecido.
    const rawApiPrefix =
      typeof opts.adminApi === 'object' && opts.adminApi.prefix
        ? opts.adminApi.prefix
        : '/api/authkit/v1'
    const aap = normalizeAdminApiPrefix(rawApiPrefix)
    // Persiste no singleton de processo para que o SDK remoto e outros consumidores
    // usem o mesmo prefixo sem precisar receber a opção.
    setAdminApiPrefix(aap)

    // Aplica o throttle de introspecção a uma rota qualquer (GET ou escrita).
    const withApiThrottle = (route: any): any => {
      if (throttles) route.use([throttles.introspection])
      return route
    }
    router
      .group(() => {
        // Usuários.
        withApiThrottle(router.get('/users', [C.apiUsers, 'index']))
        withApiThrottle(router.post('/users', [C.apiUsers, 'store']))
        withApiThrottle(router.get('/users/:id', [C.apiUsers, 'show']))
        withApiThrottle(router.patch('/users/:id', [C.apiUsers, 'update']))
        withApiThrottle(router.delete('/users/:id', [C.apiUsers, 'destroy']))
        withApiThrottle(router.post('/users/:id/disable', [C.apiUsers, 'disable']))
        withApiThrottle(router.post('/users/:id/enable', [C.apiUsers, 'enable']))
        withApiThrottle(router.post('/users/:id/reset-password', [C.apiUsers, 'resetPassword']))
        withApiThrottle(router.get('/users/:id/sessions', [C.apiUsers, 'sessions']))
        withApiThrottle(router.post('/users/:id/revoke-sessions', [C.apiUsers, 'revokeSessions']))
        // Clients OIDC.
        withApiThrottle(router.get('/clients', [C.apiClients, 'index']))
        withApiThrottle(router.post('/clients', [C.apiClients, 'store']))
        withApiThrottle(router.get('/clients/:id', [C.apiClients, 'show']))
        withApiThrottle(router.patch('/clients/:id', [C.apiClients, 'update']))
        withApiThrottle(router.post('/clients/:id/regenerate-secret', [C.apiClients, 'regenerateSecret']))
        withApiThrottle(router.delete('/clients/:id', [C.apiClients, 'destroy']))
        // Organizações.
        withApiThrottle(router.get('/organizations', [C.apiOrgs, 'index']))
        withApiThrottle(router.post('/organizations', [C.apiOrgs, 'store']))
        withApiThrottle(router.get('/organizations/:id', [C.apiOrgs, 'show']))
        withApiThrottle(router.patch('/organizations/:id', [C.apiOrgs, 'update']))
        withApiThrottle(router.delete('/organizations/:id', [C.apiOrgs, 'destroy']))
        withApiThrottle(router.post('/organizations/:id/members', [C.apiOrgs, 'addMember']))
        withApiThrottle(router.delete('/organizations/:id/members/:accountId', [C.apiOrgs, 'removeMember']))
        withApiThrottle(router.patch('/organizations/:id/members/:accountId', [C.apiOrgs, 'updateMemberRole']))
        withApiThrottle(router.post('/organizations/:id/invitations', [C.apiOrgs, 'createInvitation']))
        withApiThrottle(router.delete('/organizations/:id/invitations/:invitationId', [C.apiOrgs, 'revokeInvitation']))
        // Auditoria + métricas + verificação de token.
        withApiThrottle(router.get('/audit', [C.apiMisc, 'audit']))
        withApiThrottle(router.get('/stats', [C.apiMisc, 'stats']))
        withApiThrottle(router.post('/tokens/verify', [C.apiMisc, 'verify']))
        // Runtime settings CRUD.
        withApiThrottle(router.get('/settings', [C.apiSettings, 'index']))
        withApiThrottle(router.get('/settings/:key', [C.apiSettings, 'show']))
        withApiThrottle(router.put('/settings/:key', [C.apiSettings, 'upsert']))
        withApiThrottle(router.delete('/settings/:key', [C.apiSettings, 'destroy']))
      })
      .prefix(aap)
      .use([adminApiGuard])
  }
}
