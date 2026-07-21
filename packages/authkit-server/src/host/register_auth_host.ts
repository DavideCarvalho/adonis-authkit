import type { Router } from '@adonisjs/core/http';
import type { AuthSocialConfig, RateLimitConfigInput } from '../define_config.js';
import { resolveRateLimit } from '../define_config.js';
import { accountHome } from './account_home.js';
import { getAccountLoginUrl, setAccountLoginUrl } from './account_login_url.js';
import {
  type AccountPathsOptions,
  accountPath,
  joinAccountPath,
  setAccountPaths,
} from './account_paths.js';
import { resolveAccountRoles } from './account_roles.js';
import { adminApiGuard } from './admin_api/admin_api_guard.js';
import {
  normalizeAdminApiPrefix,
  normalizeAdminPrefix,
  setAdminApiPrefix,
  setAdminPrefix,
} from './admin_prefix.js';
import { getAuthHostConfig } from './auth_host_config.js';
import { ACCOUNT_SESSION_KEY } from './middleware/account_auth.js';
import { createAuthThrottles } from './rate_limit.js';
import { resolveRuntimeSettings } from './runtime_settings.js';
import { resolveEffectiveSessionPolicy } from './runtime_toggles.js';
import { passkey as sudoPasskey } from './sudo/methods/passkey.js';
import { password as sudoPassword } from './sudo/methods/password.js';
import {
  completeSudo,
  fail,
  guardSudoRoutes,
  setMountedSudoMethods,
  sudoContextFrom,
} from './sudo/runtime.js';
import type { SudoMethod, SudoRouteHelpers } from './sudo/types.js';

/**
 * Métodos de sudo montados quando o host não passa `sudoMethods` —
 * comportamento histórico (senha + passkey).
 *
 * PONTO ÚNICO. A tela não tem mais uma cópia desta lista: sem
 * `config.sudo.methods`, `configuredSudoMethods` cai no que FOI MONTADO, ou
 * seja, no resultado do `??` abaixo. Duas listas de default é como os dois
 * lados divergiam.
 */
const SUDO_METHOD_DEFAULTS: SudoMethod[] = [sudoPassword(), sudoPasskey()];

/** Chave da sessão Adonis que registra o timestamp da última atividade (idle timeout). */
export const ACCOUNT_LAST_SEEN_KEY = 'authkit_last_seen';

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
    // Fábrica canônica (searchPath-aware via a conexão do accountStore). Null =
    // container/DB indisponível → fail-safe: nunca encerra a sessão.
    const runtimeSettings = await resolveRuntimeSettings(ctx);
    if (!runtimeSettings) return false;
    const policy = await resolveEffectiveSessionPolicy(runtimeSettings);
    const idleMs = policy.idleTimeoutMinutes * 60 * 1000;
    if (idleMs <= 0) return false; // idle desligado

    const lastSeen = ctx.session?.get(ACCOUNT_LAST_SEEN_KEY) as number | undefined;
    const now = Date.now();
    if (lastSeen !== undefined && now - lastSeen > idleMs) {
      // Idle excedido: encerra a sessão.
      ctx.session?.forget(ACCOUNT_SESSION_KEY);
      ctx.session?.forget(ACCOUNT_LAST_SEEN_KEY);
      return true;
    }
    // Atualiza o timestamp de última atividade.
    ctx.session?.put(ACCOUNT_LAST_SEEN_KEY, now);
    return false;
  } catch {
    // FAIL-SAFE: nunca encerra a sessão em caso de erro.
    return false;
  }
}

/**
 * Constrói a URL de redirect para o login da conta, preservando o destino
 * original como `return_to` (URL-encoded). A URL de destino é o path + query
 * string da requisição atual (nunca o host — proteção contra open-redirect).
 *
 * @internal
 */
function buildLoginRedirect(ctx: any, extra?: string): string {
  // Destino configurável (`accountLoginUrl`): default `/account/login`, mas um
  // host que desmontou a tela de login (`account: { login: false }`) aponta para
  // a própria rota de login dele (ex.: `/login`). Ver `account_login_url.ts`.
  const loginUrl = getAccountLoginUrl();
  const url = ctx.request?.url?.() ?? '';
  const qs = ctx.request?.parsedUrl?.search ?? '';
  const dest = qs ? `${url}${qs}` : url;
  // Só inclui return_to quando há um caminho real (não vazio, não é o próprio login).
  if (dest && dest !== '/' && !dest.startsWith(loginUrl)) {
    const encoded = encodeURIComponent(dest);
    const sep = loginUrl.includes('?') ? '&' : '?';
    const base = extra
      ? `${loginUrl}${sep}${extra}&return_to=${encoded}`
      : `${loginUrl}${sep}return_to=${encoded}`;
    return base;
  }
  if (!extra) return loginUrl;
  const sep = loginUrl.includes('?') ? '&' : '?';
  return `${loginUrl}${sep}${extra}`;
}

/**
 * Guard inline do console de conta. Usamos uma closure (forma confiável do
 * `.use()` do AdonisJS) em vez de `() => import(middleware)` — a forma lazy de
 * classe NÃO era aplicada em runtime num grupo, deixando /account/tokens e
 * /account/mfa acessíveis sem sessão.
 */
const accountGuard = async (ctx: any, next: () => Promise<void>) => {
  if (!ctx.session?.get(ACCOUNT_SESSION_KEY)) {
    return ctx.response.redirect(buildLoginRedirect(ctx));
  }
  // Idle timeout: encerra e redireciona com query param de motivo.
  const idleExpired = await checkAndRefreshIdle(ctx);
  if (idleExpired) {
    return ctx.response.redirect(buildLoginRedirect(ctx, 'reason=idle'));
  }
  return next();
};

/**
 * Guard do console admin (B6). Como o `accountGuard`, é uma closure inline (forma
 * confiável do `.use()` num grupo). Exige:
 *   0. `config.admin.enabled` ligado (senão → 404; ver nota de flag-drift abaixo);
 *   1. sessão de conta ativa (senão → `accountLoginUrl`, default /account/login);
 *   2. a conta logada com pelo menos UMA das `config.admin.roles` nas roles globais
 *      (senão → `accountHome(cfg)`, default /account/security — NÃO revela a
 *      existência do /admin, e cai numa tela que o host controla via `accountHome`;
 *      se a tela default estiver desmontada, aponte `config.accountHome` para uma montada).
 * As roles permitidas são resolvidas em runtime do `authkit.server` (config lazy).
 */
export const adminGuard = async (ctx: any, next: () => Promise<void>) => {
  const service = await ctx.containerResolver.make('authkit.server');
  const cfg = service.config;
  // Defesa contra flag-drift: as rotas são montadas com `admin: true` em tempo de
  // registro, ANTES de o config resolver. Se o config tiver `admin.enabled: false`,
  // as rotas existem mas o console deve estar desligado — 404 (não vaza a existência).
  if (!cfg.admin.enabled) {
    return ctx.response.notFound();
  }
  const accountId = ctx.session?.get(ACCOUNT_SESSION_KEY) as string | undefined;
  if (!accountId) {
    // `/account/login` é sempre o login da conta — NÃO muda com o prefixo admin.
    return ctx.response.redirect(buildLoginRedirect(ctx));
  }
  // Idle timeout: também protege o console admin.
  const idleExpired = await checkAndRefreshIdle(ctx);
  if (idleExpired) {
    return ctx.response.redirect(buildLoginRedirect(ctx, 'reason=idle'));
  }
  const allowed = cfg.admin.roles as string[];
  const account = await cfg.accountStore.findById(accountId);
  // Resolve roles through the host's role authority (`resolveTokenRoles`) when set — the same source
  // the token claim is minted from — so an app-role admin reaches the console. Falls back to the
  // account's stored `globalRoles` when no hook is configured.
  const roles = account ? await resolveAccountRoles(cfg, account) : [];
  const isAdmin = roles.some((r: string) => allowed.includes(r));
  if (!isAdmin) {
    // Evita vazar a existência do console admin: redireciona para o accountHome
    // (sem mostrar a URL do admin).
    return ctx.response.redirect(accountHome(cfg));
  }
  return next();
};

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
  /**
   * Onde o provider OIDC é montado. Deve casar com o final do issuer. OPCIONAL:
   * quando omitido, vem do `config/authkit.ts` (lido no boot); default `/oidc`.
   */
  mountPath?: string;
  /**
   * Login social opt-in; quando presente, monta as rotas sociais (usam ctx.ally).
   * Necessário aqui (e não só no config) porque a decisão de montar as rotas é
   * tomada em tempo de registro, antes do config (lazy) resolver.
   */
  social?: AuthSocialConfig;
  /**
   * Rate-limiting (anti-brute-force) das rotas sensíveis. Necessário aqui (e não
   * só no config) porque a aplicação do throttle acontece em tempo de registro de
   * rota. Ligado por default (mesma resolução do config). Espelhe o `rateLimit` de
   * config/authkit.ts. Se `@adonisjs/limiter` não estiver configurado no host
   * (config/limiter.ts), o throttle vira no-op (fail-safe).
   */
  rateLimit?: RateLimitConfigInput;
  /**
   * Console admin opt-in (B6).
   *
   * - `true` → comportamento padrão: monta as rotas sob o prefixo `/admin` (back-compat total);
   *   modo UI `'react'` (SPA self-contained).
   * - `{ prefix?: string }` → prefixo customizado.
   *   O prefixo é normalizado: começa com `/`, sem trailing slash.
   *   Quando `prefix` é omitido ou vazio, usa o default `/admin`.
   *
   * Necessário aqui (e não só no config) porque a decisão de montar as rotas é
   * tomada em tempo de registro, antes do config (lazy) resolver.
   * Espelhe o `admin.enabled` de config/authkit.ts.
   *
   * @example
   * // Prefixo padrão
   * registerAuthHost(router, { mountPath: '/oidc', admin: true })
   *
   * // Prefixo customizado — console em /auth/admin
   * registerAuthHost(router, { mountPath: '/oidc', admin: { prefix: '/auth/admin' } })
   */
  admin?: boolean | { prefix?: string };
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
  adminApi?: boolean | { prefix?: string };
  /**
   * Métodos de sudo cujas rotas devem ser montadas. Necessário aqui (e não só
   * no config) porque a decisão de MONTAR rotas acontece em tempo de registro,
   * antes de o config lazy resolver — mesma razão de `social`/`admin`/`rateLimit`.
   * Espelhe o `sudo.methods` de config/authkit.ts.
   *
   * SUBSTITUI os defaults, não acrescenta: a lista é do host. Quem quer manter
   * senha/passkey ao lado do método novo os inclui explicitamente
   * (`[sudoMethods.password(), sudoMethods.passkey(), meuMetodo()]`).
   *
   * Sem esta opção, `config.sudo.methods` conseguiria OFERECER um método na
   * tela mas nunca montar seu endpoint — a opção aparece e dá 404. Falha
   * fechada, mas é a promessa do SPI pela metade; `magicLink()` em particular
   * não teria como ser alcançado em runtime.
   *
   * Ausente → `[password(), passkey()]`.
   */
  sudoMethods?: SudoMethod[];
  /**
   * Montagem por tela do console de conta (`/account/*`). Espelha o padrão
   * `admin`/`adminApi`: a decisão de MONTAR cada grupo de rotas é tomada em
   * tempo de registro, antes de o config (lazy) resolver.
   *
   * - Ausente → tudo montado (back-compat total).
   * - `false` → NENHUMA tela do console de conta é montada (as rotas sudo
   *   `/account/confirm` e a JSON API `/account/api/*` continuam — são
   *   infraestrutura, não telas navegáveis).
   * - objeto → montagem seletiva; cada flag ausente default `true`.
   *   - `login`    → `/account/login`, `/account/logout` (a porta por senha do console).
   *   - `tokens`   → `/account/tokens*` (Personal Access Tokens).
   *   - `orgs`     → `/account/orgs*` (multi-tenancy, incl. o accept de convite público).
   *   - `security` → `/account/security*` + `/account/email/confirm` (perfil, senha, troca de e-mail, export/LGPD, deleção).
   *   - `mfa`      → `/account/mfa*` (TOTP + passkeys).
   *   - `apps`     → `/account/apps*` (grants de consentimento OIDC).
   *
   * NOTA (flag-drift): como `admin`/`adminApi`, estas flags controlam apenas se
   * as ROTAS existem; o comportamento em runtime continua vindo do config
   * resolvido. Mantenha em sincronia — os guards são a rede de segurança.
   *
   * ⚠️ Ao desmontar `login`, os redirects internos de "faça login"
   * (`accountGuard`, `adminGuard`, `AccountAuthMiddleware`, `consoleLoginUrl()`,
   * a view `otp-unlock`) apontariam para uma rota inexistente — passe
   * `accountLoginUrl` com a rota de login do host (ex.: `'/login'`).
   *
   * @example
   * // Console passwordless: só segurança + MFA, login delegado ao OIDC do host.
   * registerAuthHost(router, {
   *   account: { login: false, tokens: false, orgs: false },
   *   accountLoginUrl: '/login',
   * })
   */
  account?: false | AccountScreensOptions;
  /**
   * Destino do redirect de "não-autenticado → faça login" do console de conta.
   * Default `/account/login`. Aponte para a rota de login do host quando a tela
   * `account/login` da lib estiver desmontada (`account: { login: false }`).
   *
   * Usado por TODOS os pontos de redirect/link de login: `accountGuard`,
   * `adminGuard`, `AccountAuthMiddleware`, `consoleLoginUrl()`, os fallbacks dos
   * controllers de conta e a view `otp-unlock`. Ver `account_login_url.ts`.
   */
  accountLoginUrl?: string;
  /**
   * Prefixo e segmentos de tela CONFIGURÁVEIS/LOCALIZÁVEIS do console de conta
   * (`/account/*`). Top-level (e não dentro de `account`) DE PROPÓSITO: mesmo
   * com `account: false`, a lib continua montando as rotas de sudo
   * (`/account/confirm*`) e a JSON API (`/account/api/*`) — o prefixo precisa
   * valer para essa infraestrutura também, então ele não pode viver debaixo da
   * flag que desmonta as telas navegáveis.
   *
   * - `prefix` troca o `/account` base (ex.: `'/conta'`).
   * - `paths` traduz cada TELA navegável (ex.: `{ security: 'seguranca',
   *   confirm: 'confirmar' }`).
   *
   * Só o prefixo e o segmento de tela são renomeáveis — os action-subpaths dos
   * POSTs internos (`/password`, `/enroll`, `/passkeys/verify`, ...) e o
   * segmento `api` da JSON API são FIXOS (endpoints de máquina, invisíveis ao
   * usuário). Ver `account_paths.ts`.
   *
   * Ausente → tudo idêntico a hoje (`/account/...` — back-compat total).
   *
   * @example
   * // Console em português: /conta/seguranca, /conta/confirmar, ...
   * registerAuthHost(router, {
   *   accountRoutes: {
   *     prefix: '/conta',
   *     paths: { security: 'seguranca', confirm: 'confirmar', mfa: 'mfa' },
   *   },
   * })
   */
  accountRoutes?: AccountPathsOptions;
}

/**
 * Flags de montagem por tela do console de conta. Cada campo ausente é `true`
 * (montado). Ver {@link AuthHostOptions.account}.
 */
export interface AccountScreensOptions {
  /** Tela de login por senha do console (`/account/login`, `/account/logout`). */
  login?: boolean;
  /** Personal Access Tokens (`/account/tokens*`). */
  tokens?: boolean;
  /** Organizations / multi-tenancy (`/account/orgs*`). */
  orgs?: boolean;
  /** Perfil, senha, troca de e-mail, export/LGPD e deleção (`/account/security*`). */
  security?: boolean;
  /** MFA — TOTP + passkeys (`/account/mfa*`). */
  mfa?: boolean;
  /** Apps com acesso / grants de consentimento OIDC (`/account/apps*`). */
  apps?: boolean;
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
  accountConfirm: () => import('./controllers/account_confirm_controller.js'),
  webauthnAsset: () => import('./controllers/webauthn_asset_controller.js'),
  // Console React JSON API (session-authed, under {prefix}/api/*).
  consoleShell: () => import('./admin_console/admin_shell_controller.js'),
  consoleOverview: () => import('./admin_console/console_overview_controller.js'),
  consoleUsers: () => import('./admin_console/console_users_controller.js'),
  consoleSessions: () => import('./admin_console/console_sessions_controller.js'),
  consoleClients: () => import('./admin_console/console_clients_controller.js'),
  consoleRoles: () => import('./admin_console/console_roles_controller.js'),
  consoleOrgs: () => import('./admin_console/console_orgs_controller.js'),
  consoleAudit: () => import('./admin_console/console_audit_controller.js'),
  consoleSettings: () => import('./admin_console/console_settings_controller.js'),
  consoleKeys: () => import('./admin_console/console_keys_controller.js'),
  consoleImpersonation: () => import('./admin_console/console_impersonation_controller.js'),
  apiUsers: () => import('./admin_api/api_users_controller.js'),
  apiClients: () => import('./admin_api/api_clients_controller.js'),
  apiMisc: () => import('./admin_api/api_misc_controller.js'),
  apiOrgs: () => import('./admin_api/api_orgs_controller.js'),
  apiSettings: () => import('./admin_api/api_settings_controller.js'),
  apiKeys: () => import('./admin_api/api_keys_controller.js'),
  // Account self-service JSON API (session-authed, under /account/api/*).
  accountApi: () => import('./account_api/account_api_controller.js'),
};

/**
 * Monta todas as rotas do host-kit do Authorization Server numa chamada.
 * Substitui registerOidcRoutes + o hand-wiring do start/routes.ts do host.
 */
export function registerAuthHost(router: Router, opts: AuthHostOptions = {}): void {
  // Config resolvido (stashado no boot do provider) — fonte única; `opts` só faz
  // OVERRIDE. Elimina o drift: o consumidor pode chamar `registerAuthHost(router)`
  // e mountPath/social/rateLimit/admin/adminApi vêm do config/authkit.ts.
  // Fallback p/ defaults quando o stash não está disponível (ex.: testes sem boot).
  const hostCfg = getAuthHostConfig();

  const mount = opts.mountPath ?? hostCfg?.mountPath ?? '/oidc';

  // social: opt explícito > config. admin/adminApi: opt explícito > (config.enabled → monta).
  const social = opts.social ?? hostCfg?.social;
  const adminOpt = opts.admin ?? (hostCfg?.adminEnabled ? true : undefined);
  const adminApiOpt = opts.adminApi ?? (hostCfg?.adminApiEnabled ? true : undefined);

  // Prefixo/segmentos configuráveis do console de conta — persiste no singleton
  // de processo ANTES de qualquer construção de rota/closure, para que o registro
  // de rotas, os guards, os controllers, os e-mails e as views leiam o mesmo
  // valor. Top-level de propósito (vale mesmo com `account: false`): as rotas de
  // sudo e a JSON API respeitam o prefixo. Ausente → default `/account/*`
  // (back-compat). Ver `account_paths.ts`.
  if (opts.accountRoutes !== undefined) {
    setAccountPaths(opts.accountRoutes);
  }

  // Destino do redirect de "faça login" — persiste no singleton de processo para
  // que os guards (closures de tempo de registro), o middleware, os controllers e
  // as views leiam o mesmo valor. Só quando a opção foi passada (senão deriva de
  // `accountPath('login')` — back-compat).
  if (opts.accountLoginUrl !== undefined) {
    setAccountLoginUrl(opts.accountLoginUrl);
  }

  // Montagem por tela do console de conta. `undefined` → tudo montado;
  // `false` → nada; objeto → cada flag ausente default `true`.
  const accountOpt = opts.account;
  const mountScreen = (key: keyof AccountScreensOptions): boolean => {
    if (accountOpt === false) return false;
    if (accountOpt && typeof accountOpt === 'object') return accountOpt[key] !== false;
    return true;
  };
  const mountLogin = mountScreen('login');
  const mountTokens = mountScreen('tokens');
  const mountOrgs = mountScreen('orgs');
  const mountSecurity = mountScreen('security');
  const mountMfa = mountScreen('mfa');
  const mountApps = mountScreen('apps');

  // Throttles opt-in (anti-brute-force). `undefined` quando rate-limit desligado.
  const resolvedRateLimit =
    opts.rateLimit !== undefined
      ? resolveRateLimit(opts.rateLimit)
      : (hostCfg?.rateLimit ?? resolveRateLimit(undefined));
  const throttles = createAuthThrottles(resolvedRateLimit);
  // Helpers: aplicam o middleware de throttle quando presente; senão no-op.
  const withLogin = (route: any): void => {
    if (throttles) route.use([throttles.login]);
  };
  const withIntrospection = (route: ReturnType<Router['post']>): void => {
    if (throttles) route.use([throttles.introspection]);
  };
  // Bucket PRÓPRIO das rotas de sudo. Antes elas levavam o `withLogin`, o que
  // funcionava mas somava dois orçamentos que medem coisas diferentes: login é
  // um anônimo adivinhando credenciais, sudo é um usuário JÁ autenticado
  // reprovando a própria identidade. Ver `ResolvedRateLimitConfig.sudo`.
  const withSudo = (route: any): void => {
    if (throttles) route.use([throttles.sudo]);
  };

  // ─── Assets estáticos do host-kit (públicos, sem autenticação) ─────────────
  // Bundle do @simplewebauthn/browser servido pelo próprio app, no lugar do
  // import de CDN público que as views de login/MFA/confirm faziam.
  //
  // Path FIXO e no topo, de propósito:
  //  • não pode viver sob o prefixo do console admin (`admin` é opt-in) —
  //    login.edge e mfa-challenge.edge precisam do script em qualquer host;
  //  • sem guard, porque é carregado NA tela de login, antes de haver sessão;
  //  • registrado ANTES do wildcard `${mount}/*` para que nenhum mountPath
  //    agressivo (ex.: '/') consiga engolir o asset e quebrar o login.
  router.get('/authkit/assets/webauthn.js', [C.webauthnAsset]).as('authkit.assets.webauthn');

  // Provider OIDC (wildcard + root) — o que registerOidcRoutes fazia.
  router.any(`${mount}/*`, [C.oidc]).as('authkit.oidc.wildcard');
  router.any(mount, [C.oidc]).as('authkit.oidc.root');

  // Interaction (login multi-step + consent + signup).
  router.get('/auth/interaction/:uid', [C.interaction, 'show']);
  router.post('/auth/interaction/:uid/identifier', [C.interaction, 'identifier']);
  withLogin(router.post('/auth/interaction/:uid/login', [C.interaction, 'login']));
  withLogin(router.post('/auth/interaction/:uid/mfa', [C.interaction, 'mfaVerify']));
  // Troca de senha obrigatória quando a senha expirou (password expiration gate).
  withLogin(
    router.post('/auth/interaction/:uid/password-expired', [
      C.interaction,
      'changeExpiredPassword',
    ]),
  );
  // Passkey como 2º fator alternativo no login (begin/finish; challenge na sessão).
  router.post('/auth/interaction/:uid/passkey/options', [C.interaction, 'passkeyOptions']);
  withLogin(router.post('/auth/interaction/:uid/passkey/verify', [C.interaction, 'passkeyVerify']));
  // Magic link (passwordless): POST emite (throttled), GET consome o token do link.
  withLogin(router.post('/auth/interaction/:uid/magic', [C.interaction, 'magicLinkRequest']));
  router.get('/auth/interaction/:uid/magic', [C.interaction, 'magicLinkConsume']);
  router.post('/auth/interaction/:uid/consent', [C.interaction, 'consent']);
  router.get('/auth/interaction/:uid/switch', [C.interaction, 'switchIdentifier']);
  // OTP unlock: link enviado por e-mail quando o fator TOTP/recovery é travado.
  router.get('/auth/otp-unlock/:token', [C.interaction, 'otpUnlock']);
  router.get('/auth/interaction/:uid/signup', [C.registration, 'showSignup']);
  withLogin(router.post('/auth/interaction/:uid/signup', [C.registration, 'signup']));

  // Recuperação de senha (standalone).
  router.get('/auth/forgot-password', [C.registration, 'showForgot']);
  withLogin(router.post('/auth/forgot-password', [C.registration, 'forgot']));
  router.get('/auth/reset-password', [C.registration, 'showReset']);
  withLogin(router.post('/auth/reset-password', [C.registration, 'reset']));

  // Verificação de e-mail (standalone, GET-only — consome o token do link).
  router.get('/auth/verify-email', [C.registration, 'verifyEmail']);

  // Login social (opt-in — do config ou opts).
  if (social) {
    router.get('/auth/:provider/redirect/:uid', [C.social, 'redirect']);
    router.get('/auth/:provider/callback', [C.social, 'callback']);
  }

  // PAT introspection (server-to-server).
  withIntrospection(router.post('/authkit/pat/introspect', [C.patIntrospection, 'handle']));

  // Paths do console de conta (configuráveis/localizáveis via `accountRoutes`).
  // As TELAS vêm de `accountPath(key)` (prefixo + segmento configurável); os
  // action-subpaths concatenados (`/password`, `/enroll`, ...) são FIXOS —
  // endpoints de formulário invisíveis ao usuário. A JSON API segue o prefixo
  // com o segmento `api` FIXO. Capturados uma vez aqui: `setAccountPaths` já
  // rodou no topo e o singleton não muda mais neste processo.
  const loginPath = accountPath('login');
  const logoutPath = accountPath('logout');
  const securityPath = accountPath('security');
  const tokensPath = accountPath('tokens');
  const appsPath = accountPath('apps');
  const mfaPath = accountPath('mfa');
  const confirmPath = accountPath('confirm');
  const orgsPath = accountPath('orgs');
  const emailConfirmPath = accountPath('emailConfirm');
  const apiBase = joinAccountPath('api');

  // Organizations — invitation accept (sem guard: controller lida com não-autenticado).
  // Parte da tela `orgs`: desmontada junto (sem multi-tenancy, não há convite a aceitar).
  if (mountOrgs) {
    router.get(`${orgsPath}/invitations/:token/accept`, [C.accountOrgs, 'showAcceptInvitation']);
    router.post(`${orgsPath}/invitations/:token/accept`, [C.accountOrgs, 'acceptInvitation']);
  }

  // Console de conta (login de sessão do IdP + gerência de PAT).
  // Tela `login` desmontável: hosts passwordless delegam ao OIDC próprio e
  // apontam `accountLoginUrl` para a rota de login deles.
  if (mountLogin) {
    router.get(loginPath, [C.accountSession, 'show']);
    // L6: throttle por IP no login/logout do console de conta (anti-brute-force),
    // alinhado com as demais rotas de credencial (interaction, forgot, reset).
    withLogin(router.post(loginPath, [C.accountSession, 'login']));
    withLogin(router.post(logoutPath, [C.accountSession, 'logout']));
  }

  // Confirmação de troca de e-mail (standalone, GET-only — consome o token do link;
  // pode ser aberta em outro dispositivo, então NÃO exige sessão). Parte da tela
  // `security` (o terminal do fluxo de troca de e-mail).
  if (mountSecurity) {
    router.get(emailConfirmPath, [C.accountSecurity, 'confirmEmail']);
  }

  // Rotas de tokens protegidas por AccountAuthMiddleware (redireciona para a tela de login se não autenticado).
  router
    .group(() => {
      // Personal Access Tokens (tela `tokens`).
      if (mountTokens) {
        router.get(tokensPath, [C.accountTokens, 'index']);
        router.post(tokensPath, [C.accountTokens, 'store']);
        router.post(`${tokensPath}/:id/revoke`, [C.accountTokens, 'destroy']);
      }

      // Segurança da conta: trocar senha + solicitar troca de e-mail + perfil (tela `security`).
      if (mountSecurity) {
        router.get(securityPath, [C.accountSecurity, 'index']);
        router.post(`${securityPath}/password`, [C.accountSecurity, 'changePassword']);
        router.post(`${securityPath}/email`, [C.accountSecurity, 'changeEmail']);
        router.post(`${securityPath}/email/cancel`, [C.accountSecurity, 'cancelEmailChange']);
        router.post(`${securityPath}/profile`, [C.accountSecurity, 'updateProfile']);
        // LGPD/GDPR: export de dados (portabilidade) + deleção self-service (danger zone).
        // O export carrega o throttle de login (anti-abuso) quando o rate-limit existe.
        withLogin(router.get(`${securityPath}/export`, [C.accountSecurity, 'exportData']));
        router.post(`${securityPath}/delete`, [C.accountSecurity, 'deleteAccount']);
        // Trusted devices: limpa o cookie de confiança DESTE navegador.
        router.post(`${securityPath}/trusted-devices/revoke`, [
          C.accountSecurity,
          'revokeTrustedDevices',
        ]);
      }

      // Apps com acesso (consentimento): lista os grants da conta + revogação por client (tela `apps`).
      if (mountApps) {
        router.get(appsPath, [C.accountApps, 'index']);
        router.post(`${appsPath}/:clientId/revoke`, [C.accountApps, 'revoke']);
      }

      // MFA — TOTP + passkeys (tela `mfa`).
      if (mountMfa) {
        // MFA / TOTP (enrollment, confirmação, disable).
        router.get(mfaPath, [C.accountMfa, 'index']);
        router.post(`${mfaPath}/enroll`, [C.accountMfa, 'enroll']);
        router.post(`${mfaPath}/confirm`, [C.accountMfa, 'confirm']);
        router.post(`${mfaPath}/disable`, [C.accountMfa, 'disable']);

        // MFA / WebAuthn (passkeys): registro (begin/finish) + remoção.
        router.post(`${mfaPath}/passkeys/options`, [C.accountMfa, 'passkeyRegisterOptions']);
        router.post(`${mfaPath}/passkeys/verify`, [C.accountMfa, 'passkeyRegisterVerify']);
        router.post(`${mfaPath}/passkeys/:id/remove`, [C.accountMfa, 'passkeyRemove']);
      }

      // Sudo mode (confirm identity): o GET lista os métodos; cada método
      // registra suas próprias rotas de verificação (SPI `SudoMethod`).
      router.get(confirmPath, [C.accountConfirm, 'show']);

      // Rotas próprias dos métodos de sudo — DENTRO do grupo com `accountGuard`.
      // O guard não é só "tem sessão": ele roda `checkAndRefreshIdle`, que apaga
      // a sessão vencida por idle e refresca `authkit_last_seen`. Fora do grupo,
      // uma sessão já vencida (ainda não colhida) podia postar a senha correta e
      // receber `markSudo` — e as rotas de sudo não refrescavam o last-seen.
      // Nenhum método built-in é alcançável por GET vindo de e-mail: o token de
      // sudo por magic link vive na PRÓPRIA sessão, então o usuário precisa
      // estar logado no mesmo navegador de qualquer forma. Um método que
      // genuinamente não puder ficar sob o guard precisa de uma decisão
      // explícita, não de mover todos para fora.
      const helpers: SudoRouteHelpers = {
        contextFrom: sudoContextFrom,
        completeSudo,
        fail,
      };
      const sudoMethodsToMount = opts?.sudoMethods ?? SUDO_METHOD_DEFAULTS;
      for (const method of sudoMethodsToMount) {
        // `guardSudoRoutes` embrulha os handlers que o método registrar, para
        // que `config.sudo.methods` os desabilite de fato mesmo que o método
        // não tenha checado nada por dentro. Ver o docblock lá.
        //
        // `withSudo` vai junto: TODA rota de um método de sudo leva o throttle
        // do bucket de SUDO (no-op sem rate-limit). Não é adorno — o POST que
        // emite o magic link de sudo dispara um e-mail por chamada, e o
        // `accountGuard` sozinho só exige uma sessão viva, que o abusador tem.
        // Aplicar aqui, no wrapper, cobre também os métodos customizados, que
        // não teriam como pedir throttle pelo `SudoRouteHelpers`.
        //
        // Bucket próprio, não o de login: mesmos limites, contagem separada —
        // errar a senha na tela de confirmação não pode gastar o orçamento de
        // login do IP, nem vice-versa.
        method.register?.(guardSudoRoutes(router, method.id, helpers, withSudo), helpers);
      }
      // A lista montada é a fonte de verdade dos DOIS lados quando o host não
      // configura `config.sudo.methods`: a tela oferece exatamente isto, e os
      // handlers aceitam exatamente isto.
      setMountedSudoMethods(sudoMethodsToMount);

      // Organizations (multi-tenancy) — tela `orgs`. Montadas por default;
      // controller retorna 404/403 sem tabelas (capability-probed).
      if (mountOrgs) {
        router.get(orgsPath, [C.accountOrgs, 'index']);
        router.post(orgsPath, [C.accountOrgs, 'store']);
        router.post(`${orgsPath}/deactivate`, [C.accountOrgs, 'deactivate']);
        router.post(`${orgsPath}/:id/activate`, [C.accountOrgs, 'activate']);
        router.post(`${orgsPath}/:id/leave`, [C.accountOrgs, 'leave']);
        router.post(`${orgsPath}/:id/invite`, [C.accountOrgs, 'invite']);
        router.post(`${orgsPath}/:id/members/:accountId/remove`, [C.accountOrgs, 'removeMember']);
        router.post(`${orgsPath}/:id/invitations/:invId/revoke`, [
          C.accountOrgs,
          'revokeInvitation',
        ]);
        // JSON endpoints for React hooks (authkit-react).
        router.get(`${orgsPath}/json`, [C.accountOrgs, 'listJson']);
        router.get(`${orgsPath}/invitations/json`, [C.accountOrgs, 'listInvitationsJson']);
        router.get(`${orgsPath}/:id/json`, [C.accountOrgs, 'showJson']);
      }

      // ─── Account self-service JSON API (authkit-react TanStack hooks) ─────
      // ⚠️ ORDER MATTERS: fixed-segment routes before parameterised ones.
      // Registered INSIDE the accountGuard group → same session-auth protection.
      // Mutating routes use CSRF (shield middleware on the host app).
      // Segue o prefixo do console (`accountRoutes.prefix`); o segmento `api` é
      // FIXO — é contrato de máquina (authkit-react), não path de humano.
      router.get(`${apiBase}/me`, [C.accountApi, 'me']);
      router.get(`${apiBase}/security`, [C.accountApi, 'securityOverview']);
      router.patch(`${apiBase}/profile`, [C.accountApi, 'updateProfile']);
      router.post(`${apiBase}/password`, [C.accountApi, 'changePassword']);
      // Email-change: cancel BEFORE the generic post to avoid pattern collision.
      router.post(`${apiBase}/email-change/cancel`, [C.accountApi, 'cancelEmailChange']);
      router.post(`${apiBase}/email-change`, [C.accountApi, 'requestEmailChange']);
      // Sessions: fixed routes BEFORE :id.
      router.get(`${apiBase}/sessions`, [C.accountApi, 'listSessions']);
      router.post(`${apiBase}/sessions/revoke-others`, [C.accountApi, 'revokeOtherSessions']);
      router.post(`${apiBase}/sessions/revoke-all`, [C.accountApi, 'revokeAllSessions']);
      router.delete(`${apiBase}/sessions/:id`, [C.accountApi, 'revokeSession']);
      // Apps (grants).
      router.get(`${apiBase}/apps`, [C.accountApi, 'listApps']);
      router.delete(`${apiBase}/apps/:clientId`, [C.accountApi, 'revokeApp']);
      // MFA + passkeys.
      router.get(`${apiBase}/mfa`, [C.accountApi, 'mfaStatus']);
      router.get(`${apiBase}/passkeys`, [C.accountApi, 'listPasskeys']);
      router.delete(`${apiBase}/passkeys/:id`, [C.accountApi, 'removePasskey']);
      // PATs.
      router.get(`${apiBase}/tokens`, [C.accountApi, 'listTokens']);
      router.post(`${apiBase}/tokens`, [C.accountApi, 'createToken']);
      router.delete(`${apiBase}/tokens/:id`, [C.accountApi, 'revokeToken']);
      // Orgs: invitations BEFORE :id (fixed segment before parameterised).
      router.get(`${apiBase}/orgs`, [C.accountApi, 'listOrgs']);
      router.get(`${apiBase}/orgs/invitations`, [C.accountApi, 'listOrgInvitations']);
      router.get(`${apiBase}/orgs/:id`, [C.accountApi, 'showOrg']);
    })
    .use([accountGuard]);

  // Console admin (do config.admin.enabled ou opts). Protegido pelo adminGuard (sessão + role global).
  if (adminOpt) {
    // Resolve o prefixo: `true` → '/admin' (default); objeto → usa prefix fornecido.
    const rawPrefix = typeof adminOpt === 'object' && adminOpt.prefix ? adminOpt.prefix : '/admin';
    const ap = normalizeAdminPrefix(rawPrefix);
    // Persiste no singleton de processo para que controllers e views usem o mesmo prefixo.
    setAdminPrefix(ap);

    router
      .group(() => {
        // Console admin (SPA React self-contained): todas as rotas GET servem o
        // shell HTML; os endpoints JSON sob {prefix}/api/* são a fonte de dados da SPA.

        // ⚠️ ORDEM IMPORTA: o AdonisJS casa rotas wildcard por ORDEM DE REGISTRO.
        // Os assets e TODA a JSON API `/api/*` precisam ser registrados ANTES do
        // catch-all `${ap}/*` (que serve o shell HTML), senão o catch-all engole
        // `/api/*` e devolve HTML onde a SPA espera JSON ("Unexpected token '<'").

        // ─── Assets estáticos do Vite build ───────────────────────────────────
        router.get(`${ap}/assets/*`, [C.consoleShell, 'serveAsset']).as('authkit_console_assets');

        // ─── JSON API do console (session-authed via adminGuard upstream) ─────
        // GET {ap}/api/overview
        router.get(`${ap}/api/overview`, [C.consoleOverview, 'handle']);
        // Usuários.
        router.get(`${ap}/api/users`, [C.consoleUsers, 'index']);
        router.get(`${ap}/api/users/:id`, [C.consoleUsers, 'show']);
        router.post(`${ap}/api/users`, [C.consoleUsers, 'store']);
        router.patch(`${ap}/api/users/:id/roles`, [C.consoleUsers, 'updateRoles']);
        router.post(`${ap}/api/users/:id/disable`, [C.consoleUsers, 'disable']);
        router.post(`${ap}/api/users/:id/enable`, [C.consoleUsers, 'enable']);
        router.post(`${ap}/api/users/:id/reset-password`, [C.consoleUsers, 'resetPassword']);
        router.delete(`${ap}/api/users/:id`, [C.consoleUsers, 'destroy']);
        // Sessões.
        router.get(`${ap}/api/sessions`, [C.consoleSessions, 'index']);
        router.post(`${ap}/api/sessions/revoke-all`, [C.consoleSessions, 'revokeAll']);
        // Sessões por usuário (drawer do user — ANTES do catch-all para não receber HTML).
        router.get(`${ap}/api/users/:id/sessions`, [C.consoleSessions, 'userSessions']);
        router.post(`${ap}/api/users/:id/revoke-sessions`, [
          C.consoleSessions,
          'userRevokeSessions',
        ]);
        // Clients OIDC.
        router.get(`${ap}/api/clients`, [C.consoleClients, 'index']);
        router.post(`${ap}/api/clients`, [C.consoleClients, 'store']);
        router.patch(`${ap}/api/clients/:id`, [C.consoleClients, 'update']);
        router.delete(`${ap}/api/clients/:id`, [C.consoleClients, 'destroy']);
        router.post(`${ap}/api/clients/:id/regenerate-secret`, [
          C.consoleClients,
          'regenerateSecret',
        ]);
        // Roles.
        router.get(`${ap}/api/roles`, [C.consoleRoles, 'index']);
        router.post(`${ap}/api/roles`, [C.consoleRoles, 'store']);
        router.patch(`${ap}/api/roles/:name`, [C.consoleRoles, 'update']);
        router.delete(`${ap}/api/roles/:name`, [C.consoleRoles, 'destroy']);
        // Organizações (capability-gated: 404 quando store não suporta).
        // ⚠️ Rotas fixas ANTES de parametrizadas para evitar shadowing.
        router.get(`${ap}/api/orgs`, [C.consoleOrgs, 'index']);
        router.post(`${ap}/api/orgs`, [C.consoleOrgs, 'store']);
        router.get(`${ap}/api/orgs/:id`, [C.consoleOrgs, 'show']);
        router.patch(`${ap}/api/orgs/:id`, [C.consoleOrgs, 'update']);
        router.delete(`${ap}/api/orgs/:id`, [C.consoleOrgs, 'destroy']);
        // Membros: PATCH (role) ANTES de DELETE para não colidir, ambos antes do catch-all.
        router.post(`${ap}/api/orgs/:id/members`, [C.consoleOrgs, 'addMember']);
        router.patch(`${ap}/api/orgs/:id/members/:accountId`, [C.consoleOrgs, 'updateMemberRole']);
        router.delete(`${ap}/api/orgs/:id/members/:accountId`, [C.consoleOrgs, 'removeMember']);
        // Convites.
        router.post(`${ap}/api/orgs/:id/invitations`, [C.consoleOrgs, 'createInvitation']);
        router.delete(`${ap}/api/orgs/:id/invitations/:invitationId`, [
          C.consoleOrgs,
          'revokeInvitation',
        ]);
        // Auditoria (capability-gated: 404 quando sink não suporta consulta).
        router.get(`${ap}/api/audit`, [C.consoleAudit, 'index']);
        // Settings.
        router.get(`${ap}/api/settings`, [C.consoleSettings, 'index']);
        router.put(`${ap}/api/settings/:key`, [C.consoleSettings, 'upsert']);
        router.delete(`${ap}/api/settings/:key`, [C.consoleSettings, 'destroy']);
        // Chave de assinatura managed (status + rotação ao vivo).
        router.get(`${ap}/api/keys`, [C.consoleKeys, 'status']);
        router.post(`${ap}/api/keys/rotate`, [C.consoleKeys, 'rotate']);
        // Impersonation (capability-gated: 404 quando desabilitado ou sem client).
        router.get(`${ap}/api/impersonation/:userId`, [C.consoleImpersonation, 'handle']);

        // ─── Shell HTML — POR ÚLTIMO (catch-all) ──────────────────────────────
        // Serve a SPA para todas as demais rotas GET do console; o roteamento
        // client-side (hash) é tratado pela SPA. Nomes explícitos: o mesmo par
        // controller.método em duas rotas colide no auto-naming do AdonisJS.
        router.get(ap, [C.consoleShell, 'serve']).as('authkit_console_root');
        router.get(`${ap}/*`, [C.consoleShell, 'serve']).as('authkit_console_shell');
      })
      .use([adminGuard]);
  }

  // Admin REST API (opt-in — R6). Superfície machine-to-machine atrás do
  // adminApiGuard (API key). Todas as rotas levam o throttle de introspecção.
  if (adminApiOpt) {
    // Resolve o prefixo: `true` → '/api/authkit/v1' (default); objeto → usa prefix fornecido.
    const rawApiPrefix =
      typeof adminApiOpt === 'object' && adminApiOpt.prefix
        ? adminApiOpt.prefix
        : '/api/authkit/v1';
    const aap = normalizeAdminApiPrefix(rawApiPrefix);
    // Persiste no singleton de processo para que o SDK remoto e outros consumidores
    // usem o mesmo prefixo sem precisar receber a opção.
    setAdminApiPrefix(aap);

    // Aplica o throttle de introspecção a uma rota qualquer (GET ou escrita).
    const withApiThrottle = (route: any): any => {
      if (throttles) route.use([throttles.introspection]);
      return route;
    };
    router
      .group(() => {
        // Usuários.
        withApiThrottle(router.get('/users', [C.apiUsers, 'index']));
        withApiThrottle(router.post('/users', [C.apiUsers, 'store']));
        withApiThrottle(router.get('/users/:id', [C.apiUsers, 'show']));
        withApiThrottle(router.patch('/users/:id', [C.apiUsers, 'update']));
        withApiThrottle(router.delete('/users/:id', [C.apiUsers, 'destroy']));
        withApiThrottle(router.post('/users/:id/disable', [C.apiUsers, 'disable']));
        withApiThrottle(router.post('/users/:id/enable', [C.apiUsers, 'enable']));
        withApiThrottle(router.post('/users/:id/reset-password', [C.apiUsers, 'resetPassword']));
        withApiThrottle(router.get('/users/:id/sessions', [C.apiUsers, 'sessions']));
        withApiThrottle(router.post('/users/:id/revoke-sessions', [C.apiUsers, 'revokeSessions']));
        // Clients OIDC.
        withApiThrottle(router.get('/clients', [C.apiClients, 'index']));
        withApiThrottle(router.post('/clients', [C.apiClients, 'store']));
        withApiThrottle(router.get('/clients/:id', [C.apiClients, 'show']));
        withApiThrottle(router.patch('/clients/:id', [C.apiClients, 'update']));
        withApiThrottle(
          router.post('/clients/:id/regenerate-secret', [C.apiClients, 'regenerateSecret']),
        );
        withApiThrottle(router.delete('/clients/:id', [C.apiClients, 'destroy']));
        // Organizações.
        withApiThrottle(router.get('/organizations', [C.apiOrgs, 'index']));
        withApiThrottle(router.post('/organizations', [C.apiOrgs, 'store']));
        withApiThrottle(router.get('/organizations/:id', [C.apiOrgs, 'show']));
        withApiThrottle(router.patch('/organizations/:id', [C.apiOrgs, 'update']));
        withApiThrottle(router.delete('/organizations/:id', [C.apiOrgs, 'destroy']));
        withApiThrottle(router.post('/organizations/:id/members', [C.apiOrgs, 'addMember']));
        withApiThrottle(
          router.delete('/organizations/:id/members/:accountId', [C.apiOrgs, 'removeMember']),
        );
        withApiThrottle(
          router.patch('/organizations/:id/members/:accountId', [C.apiOrgs, 'updateMemberRole']),
        );
        withApiThrottle(
          router.post('/organizations/:id/invitations', [C.apiOrgs, 'createInvitation']),
        );
        withApiThrottle(
          router.delete('/organizations/:id/invitations/:invitationId', [
            C.apiOrgs,
            'revokeInvitation',
          ]),
        );
        // Auditoria + métricas + verificação de token.
        withApiThrottle(router.get('/audit', [C.apiMisc, 'audit']));
        withApiThrottle(router.get('/stats', [C.apiMisc, 'stats']));
        withApiThrottle(router.post('/tokens/verify', [C.apiMisc, 'verify']));
        // Runtime settings CRUD.
        withApiThrottle(router.get('/settings', [C.apiSettings, 'index']));
        withApiThrottle(router.get('/settings/:key', [C.apiSettings, 'show']));
        withApiThrottle(router.put('/settings/:key', [C.apiSettings, 'upsert']));
        withApiThrottle(router.delete('/settings/:key', [C.apiSettings, 'destroy']));
        // Chave de assinatura managed (status + rotação ao vivo).
        withApiThrottle(router.get('/keys', [C.apiKeys, 'status']));
        withApiThrottle(router.post('/keys/rotate', [C.apiKeys, 'rotate']));
      })
      .prefix(aap)
      // Throttle por IP do grupo inteiro (M8): roda ANTES da guard, então tentativas
      // de Bearer key inválida do mesmo IP são limitadas mesmo quando a auth falha.
      // O `withApiThrottle` (introspection, por token) continua como camada adicional.
      .use(throttles ? [throttles.adminIp, adminApiGuard] : [adminApiGuard]);
  }
}
