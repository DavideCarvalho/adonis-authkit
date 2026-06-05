import type { Router } from '@adonisjs/core/http'
import type { AuthSocialConfig, RateLimitConfigInput } from '../define_config.js'
import { resolveRateLimit } from '../define_config.js'
import { createAuthThrottles } from './rate_limit.js'
import { ACCOUNT_SESSION_KEY } from './middleware/account_auth.js'

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
    return ctx.response.redirect('/account/login')
  }
  const allowed = cfg.admin.roles as string[]
  const account = await cfg.accountStore.findById(accountId)
  const roles = account?.globalRoles ?? []
  const isAdmin = roles.some((r: string) => allowed.includes(r))
  if (!isAdmin) {
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
   * Console admin opt-in (B6); quando `true`, monta o grupo `/admin/*` atrás do
   * adminGuard. Necessário aqui (e não só no config) porque a decisão de montar
   * as rotas é tomada em tempo de registro, antes do config (lazy) resolver.
   * Espelhe o `admin.enabled` de config/authkit.ts.
   */
  admin?: boolean
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
  adminDashboard: () => import('./controllers/admin/admin_dashboard_controller.js'),
  adminUsers: () => import('./controllers/admin/admin_users_controller.js'),
  adminSessions: () => import('./controllers/admin/admin_sessions_controller.js'),
  adminClients: () => import('./controllers/admin/admin_clients_controller.js'),
  adminAudit: () => import('./controllers/admin/admin_audit_controller.js'),
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
  const withLogin = (route: ReturnType<Router['post']>): void => {
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
  // Passkey como 2º fator alternativo no login (begin/finish; challenge na sessão).
  router.post('/auth/interaction/:uid/passkey/options', [C.interaction, 'passkeyOptions'])
  withLogin(router.post('/auth/interaction/:uid/passkey/verify', [C.interaction, 'passkeyVerify']))
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
      router.post('/account/security/profile', [C.accountSecurity, 'updateProfile'])

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
    })
    .use([accountGuard])

  // Console admin (opt-in — B6). Protegido pelo adminGuard (sessão + role global).
  if (opts.admin) {
    router
      .group(() => {
        router.get('/admin', [C.adminDashboard, 'index'])
        router.get('/admin/users', [C.adminUsers, 'index'])
        router.post('/admin/users', [C.adminUsers, 'store'])
        router.post('/admin/users/:id/roles', [C.adminUsers, 'updateRoles'])
        router.post('/admin/users/:id/reset-password', [C.adminUsers, 'resetPassword'])
        router.post('/admin/users/:id/disable', [C.adminUsers, 'disable'])
        router.post('/admin/users/:id/enable', [C.adminUsers, 'enable'])
        // Sessões/grants ativos da conta + revogação em massa.
        router.get('/admin/users/:id/sessions', [C.adminSessions, 'index'])
        router.post('/admin/users/:id/revoke-sessions', [C.adminSessions, 'revoke'])
        router.get('/admin/clients', [C.adminClients, 'index'])
        // CRUD de clients OIDC (adapter-backed). `/new` ANTES de `:id` p/ não casar
        // "new" como id; todas as escritas são POST (com _csrf na view).
        router.get('/admin/clients/new', [C.adminClients, 'create'])
        router.post('/admin/clients', [C.adminClients, 'store'])
        router.get('/admin/clients/:id/edit', [C.adminClients, 'edit'])
        router.post('/admin/clients/:id/edit', [C.adminClients, 'update'])
        router.post('/admin/clients/:id/regenerate-secret', [C.adminClients, 'regenerateSecret'])
        router.post('/admin/clients/:id/delete', [C.adminClients, 'destroy'])
        router.get('/admin/audit', [C.adminAudit, 'index'])
      })
      .use([adminGuard])
  }
}
