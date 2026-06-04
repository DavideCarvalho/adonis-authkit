import { configProvider } from '@adonisjs/core'
import type { ApplicationService } from '@adonisjs/core/types'
import type { HttpContext } from '@adonisjs/core/http'
import type { ClientConfig, JwksConfig, ObservabilityConfig, TtlConfig } from '@dudousxd/adonis-authkit-core'
import { generateJwks } from './keys/jwks_manager.js'
import { adapters, type AdapterFactory, type OidcAdapterClass } from './adapters/factory.js'
import type { AccountStore, AuthAccount } from './accounts/account_store.js'
import type { PatStore } from './pat/pat_store.js'
import type { AuditSink } from './audit/audit_sink.js'
import type { BrandingConfig } from './host/branding.js'
import { resolveMessages, type AuthMessages, type I18nConfig } from './host/i18n.js'

export { adapters }
export type { AuthAccount }

export type AuthHostRenderer = (
  ctx: HttpContext,
  view: string,
  props: Record<string, unknown>
) => unknown

export interface AuthSocialConfig {
  providers: string[]
}

/**
 * Hooks de e-mail plugáveis (best-effort). Quando ausentes, o host-kit cai no
 * fallback de log em dev (sem enviar e-mail). O envio real fica a cargo do host
 * (ex.: @adonisjs/mail), mantendo a lib agnóstica de transporte.
 */
export interface MailHooks {
  /** Disparado após gerar o token de redefinição de senha. */
  onPasswordReset?: (data: { email: string; resetUrl: string; token: string }) => Promise<void>
  /** Disparado após gerar o token de verificação de e-mail. */
  onEmailVerification?: (data: {
    email: string
    verifyUrl: string
    token: string
  }) => Promise<void>
}

/** Bucket de rate-limit: pontos (requests) permitidos por janela de duração. */
export interface RateLimitBucket {
  /** Número de requests permitidos na janela. */
  points: number
  /** Duração da janela (ex.: '1 min', '15 mins', 60). */
  duration: string
}

/**
 * Rate-limiting para as rotas sensíveis do host-kit.
 * Backed pelo `@adonisjs/limiter` (o host precisa tê-lo configurado: config/limiter.ts).
 * Ligado por default; se o limiter não estiver configurado, o throttle vira no-op
 * (fail-safe, sem quebra). Passe `enabled: false` para montar as rotas SEM throttle.
 */
export interface RateLimitConfigInput {
  /** Liga o rate-limit. Default: true. */
  enabled?: boolean
  /** Bucket das rotas de login/signup/forgot/reset (keyed por IP). Default: 10 req / 1 min. */
  login?: RateLimitBucket
  /** Bucket da rota de introspecção de PAT (keyed por IP ou bearer). Default: 60 req / 1 min. */
  introspection?: RateLimitBucket
  /** Nome do store configurado em config/limiter.ts a usar. Default: store padrão do host. */
  store?: string
}

export interface ResolvedRateLimitConfig {
  enabled: boolean
  login: RateLimitBucket
  introspection: RateLimitBucket
  store?: string
}

const RATE_LIMIT_DEFAULTS: { login: RateLimitBucket; introspection: RateLimitBucket } = {
  login: { points: 10, duration: '1 min' },
  introspection: { points: 60, duration: '1 min' },
}

export function resolveRateLimit(input?: RateLimitConfigInput): ResolvedRateLimitConfig {
  const enabled = input?.enabled ?? true
  return {
    enabled,
    login: input?.login ?? RATE_LIMIT_DEFAULTS.login,
    introspection: input?.introspection ?? RATE_LIMIT_DEFAULTS.introspection,
    store: input?.store,
  }
}

/**
 * Bloqueio progressivo de conta (anti-brute-force keyed por EMAIL, complementar ao
 * rate-limit por IP). Backed pelo mesmo `@adonisjs/limiter` do host (peer/opt-in) —
 * SEM migração nem DB. Ligado por default; vira no-op se o limiter não existir.
 */
export interface LockoutConfigInput {
  /** Liga o lockout. Default: true (no-op se o limiter não estiver configurado). */
  enabled?: boolean
  /** Falhas dentro da janela antes de bloquear. Default: 5. */
  maxAttempts?: number
  /** Janela deslizante (segundos) para contar falhas. Default: 900 (15 min). */
  windowSec?: number
  /** Duração do 1º bloqueio (segundos). Default: 60. */
  baseLockoutSec?: number
  /** Teto do backoff progressivo (segundos). Default: 3600 (1 h). */
  maxLockoutSec?: number
  /** Store do `config/limiter.ts` a usar. Default: store padrão do host. */
  store?: string
}

export interface ResolvedLockoutConfig {
  enabled: boolean
  maxAttempts: number
  windowSec: number
  baseLockoutSec: number
  maxLockoutSec: number
  store?: string
}

export function resolveLockout(input?: LockoutConfigInput): ResolvedLockoutConfig {
  return {
    enabled: input?.enabled ?? true,
    maxAttempts: input?.maxAttempts ?? 5,
    windowSec: input?.windowSec ?? 900,
    baseLockoutSec: input?.baseLockoutSec ?? 60,
    maxLockoutSec: input?.maxLockoutSec ?? 3600,
    store: input?.store,
  }
}

/**
 * Registro dinâmico de clients (OIDC Dynamic Client Registration — RFC 7591).
 *
 * Quando habilitado, o oidc-provider expõe o endpoint de registro (`/reg`) e os
 * clients criados ali são PERSISTIDOS pelo MESMO adapter usado para os demais
 * artefatos OIDC. Assim, clients dinâmicos coexistem com os `clients` estáticos
 * da config e ficam disponíveis para uma futura UI admin que gerencia clients no DB.
 */
export interface DynamicRegistrationConfigInput {
  /** Liga o endpoint de registro dinâmico. Default: false (comportamento atual). */
  enabled: boolean
  /**
   * Exige um Initial Access Token (IAT) como bearer para registrar (RFC 7591 §3).
   * Quando ausente/false, o registro é ABERTO (qualquer um pode registrar um client) —
   * isso raramente é desejável em produção; prefira sempre definir um IAT.
   */
  initialAccessToken?: string
  /**
   * Habilita o Registration Management (RFC 7592): ler/atualizar/deletar o client
   * registrado via o `registration_access_token` devolvido no registro. Default: false.
   */
  management?: boolean
}

export interface ResolvedDynamicRegistrationConfig {
  enabled: boolean
  initialAccessToken?: string
  management: boolean
}

/**
 * Console admin opt-in do IdP (B6). Quando habilitado, monta o grupo `/admin/*`
 * (dashboard, usuários/papéis, clients, audit) atrás de um guard que exige sessão
 * de conta E que a conta tenha pelo menos um dos `roles` nas suas roles globais.
 * Default: DESLIGADO — hosts existentes não mudam de comportamento.
 */
export interface AdminConfigInput {
  /** Liga o console admin. Default: false. */
  enabled: boolean
  /** Roles globais que dão acesso ao /admin. Default: ['ADMIN']. */
  roles?: string[]
}

export interface ResolvedAdminConfig {
  enabled: boolean
  roles: string[]
}

export function resolveAdmin(input?: AdminConfigInput): ResolvedAdminConfig {
  return {
    enabled: input?.enabled ?? false,
    roles: input?.roles && input.roles.length > 0 ? input.roles : ['ADMIN'],
  }
}

/**
 * Parâmetros do Relying Party (RP) das cerimônias WebAuthn / passkeys. Quando
 * omitidos, são derivados do `issuer`: `rpId` = hostname (sem porta), `origin` =
 * origem (scheme://host[:port]) do issuer, `rpName` = nome do app/branding.
 */
export interface WebauthnConfigInput {
  /** Nome do RP mostrado pelo authenticator. Default: branding/app name. */
  rpName?: string
  /** RP ID — hostname (sem porta) do issuer. Default: hostname do issuer. */
  rpId?: string
  /** Origin(s) esperada(s) na verificação. Default: origem do issuer. */
  origin?: string | string[]
}

export interface ResolvedWebauthnConfig {
  rpName: string
  rpId: string
  origin: string | string[]
}

/**
 * Resolve os parâmetros do RP de WebAuthn a partir do `issuer` quando omitidos.
 * `rpName` cai no `fallbackName` (branding/mfaIssuer) quando ausente.
 */
export function resolveWebauthn(
  issuer: string,
  fallbackName: string,
  input?: WebauthnConfigInput
): ResolvedWebauthnConfig {
  let host = 'localhost'
  let origin = 'http://localhost'
  try {
    const url = new URL(issuer)
    host = url.hostname
    origin = url.origin
  } catch {
    // issuer inválido → mantém defaults de localhost (dev).
  }
  return {
    rpName: input?.rpName ?? fallbackName,
    rpId: input?.rpId ?? host,
    origin: input?.origin ?? origin,
  }
}

export interface AuthServerConfigInput {
  issuer: string
  adapter: AdapterFactory
  clients: ClientConfig[]
  jwks: JwksConfig
  ttl?: TtlConfig
  /** Nome da CLAIM (não do scope) onde os papéis globais são emitidos. Default: 'roles'. */
  globalRolesClaim?: string
  cookieKeys?: string[]
  observability?: ObservabilityConfig
  /** Contrato primário de identidade. Deriva findAccount/verifyCredentials do provider. */
  accountStore: AccountStore
  /** Opcional — necessário só para fluxos de Personal Access Token. */
  patStore?: PatStore
  /** Caminho base onde o host-kit monta as rotas OIDC. Default: '/oidc'. */
  mountPath?: string
  /** Renderer de páginas do host (Inertia ou Edge). */
  render?: AuthHostRenderer
  /** Configuração de branding por cliente. */
  branding?: BrandingConfig
  /** Internacionalização das telas. Default: pt-BR embutido (zero config). */
  i18n?: I18nConfig
  /** Configuração de providers sociais. */
  social?: AuthSocialConfig
  /** Segredo para autenticar requests de introspecção de PAT. */
  patIntrospectionSecret?: string
  /** Rate-limiting das rotas sensíveis (anti-brute-force). Default: ligado (no-op se o limiter não estiver configurado). */
  rateLimit?: RateLimitConfigInput
  /** Bloqueio progressivo de conta por email em falhas repetidas. Default: ligado (no-op sem limiter). */
  lockout?: LockoutConfigInput
  /** Hooks de e-mail (reset de senha / verificação). Opcional — fallback de log em dev. */
  mail?: MailHooks
  /** Sink de auditoria (best-effort). Opcional — quando ausente, auditoria é no-op. */
  audit?: AuditSink
  /**
   * Label de issuer TOTP mostrado nos apps autenticadores (MFA). Default: 'AuthKit'.
   * O `lucidAccountStore` lê isso para montar o keyuri/QR.
   */
  mfaIssuer?: string
  /**
   * Parâmetros do RP de WebAuthn / passkeys (2º fator alternativo ao TOTP).
   * Opcional — quando omitido, é derivado do `issuer`. As passkeys só ficam
   * disponíveis quando o accountStore + o model de credenciais suportam.
   */
  webauthn?: WebauthnConfigInput
  /**
   * Registro dinâmico de clients (RFC 7591/7592). Default: desligado. Quando ligado,
   * os clients registrados são persistidos pelo mesmo adapter OIDC.
   */
  dynamicRegistration?: DynamicRegistrationConfigInput
  /**
   * Console admin do IdP (B6). Default: desligado. Quando ligado, o host também
   * deve passar `admin: true` em {@link AuthHostOptions} no registro de rotas
   * (a montagem das rotas acontece antes do config resolver).
   */
  admin?: AdminConfigInput
}

export interface ResolvedServerConfig {
  issuer: string
  AdapterClass: OidcAdapterClass
  clients: ClientConfig[]
  jwks: { keys: Record<string, any>[] }
  ttl: { accessToken: number; refreshToken: number; idToken: number; session: number }
  globalRolesClaim: string
  cookieKeys: string[]
  observability: ObservabilityConfig
  findAccount: (sub: string) => Promise<AuthAccount | null>
  verifyCredentials: (email: string, password: string) => Promise<{ id: string } | null>
  accountStore: AccountStore
  patStore?: PatStore
  mountPath: string
  render?: AuthHostRenderer
  branding?: BrandingConfig
  social?: AuthSocialConfig
  patIntrospectionSecret?: string
  rateLimit: ResolvedRateLimitConfig
  /** Bloqueio progressivo de conta resolvido (sempre presente; default ligado). */
  lockout: ResolvedLockoutConfig
  mail?: MailHooks
  audit?: AuditSink
  mfaIssuer: string
  /** RP de WebAuthn resolvido (sempre presente; derivado do issuer por default). */
  webauthn: ResolvedWebauthnConfig
  dynamicRegistration: ResolvedDynamicRegistrationConfig
  /** Console admin resolvido (sempre presente; default desligado). */
  admin: ResolvedAdminConfig
  /** Catálogo de mensagens ativo (locale resolvido), pronto para os renderers. */
  messages: AuthMessages
  /** Locale ativo (default 'pt-BR'). */
  locale: string
}

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }

export function toSeconds(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value === 'number') return value
  const m = /^(\d+)\s*([smhd])$/.exec(value.trim())
  if (!m) throw new Error(`TTL inválido: ${value}`)
  return Number(m[1]) * UNITS[m[2]]
}

export function defineConfig(config: AuthServerConfigInput) {
  return configProvider.create(async (app: ApplicationService): Promise<ResolvedServerConfig> => {
    const AdapterClass = await config.adapter.resolver(app)

    const jwks =
      config.jwks.source === 'managed'
        ? await generateJwks(config.jwks.algorithm ?? 'RS256')
        : { keys: config.jwks.keys ?? [] }

    return {
      issuer: config.issuer,
      AdapterClass,
      clients: config.clients,
      jwks: jwks as { keys: Record<string, any>[] },
      ttl: {
        accessToken: toSeconds(config.ttl?.accessToken, 900),
        refreshToken: toSeconds(config.ttl?.refreshToken, 2592000),
        idToken: toSeconds(config.ttl?.idToken, 900),
        session: toSeconds(config.ttl?.session, 604800),
      },
      globalRolesClaim: config.globalRolesClaim ?? 'roles',
      cookieKeys: config.cookieKeys ?? [],
      observability: config.observability ?? {},
      findAccount: (sub: string) => config.accountStore.findById(sub),
      verifyCredentials: async (email: string, password: string) => {
        const acc = await config.accountStore.verifyCredentials(email, password)
        return acc ? { id: acc.id } : null
      },
      accountStore: config.accountStore,
      patStore: config.patStore,
      mountPath: config.mountPath ?? '/oidc',
      render: config.render,
      branding: config.branding,
      social: config.social,
      patIntrospectionSecret: config.patIntrospectionSecret,
      rateLimit: resolveRateLimit(config.rateLimit),
      lockout: resolveLockout(config.lockout),
      mail: config.mail,
      audit: config.audit,
      mfaIssuer: config.mfaIssuer ?? 'AuthKit',
      webauthn: resolveWebauthn(config.issuer, config.mfaIssuer ?? 'AuthKit', config.webauthn),
      dynamicRegistration: {
        enabled: config.dynamicRegistration?.enabled ?? false,
        initialAccessToken: config.dynamicRegistration?.initialAccessToken,
        management: config.dynamicRegistration?.management ?? false,
      },
      admin: resolveAdmin(config.admin),
      messages: resolveMessages(config.i18n),
      locale: config.i18n?.locale ?? 'pt-BR',
    }
  })
}
