/**
 * Funções puras de verificação para `node ace authkit:doctor`. Não dependem do
 * Ace nem do container — recebem objetos simples para serem testáveis em
 * isolamento. O comando `authkit:doctor` só coleta o ambiente e imprime os
 * resultados destas funções.
 */

export type FindingLevel = 'ok' | 'warn' | 'error'

export interface Finding {
  level: FindingLevel
  message: string
}

/** Entrada mínima necessária para rodar os checks (subconjunto da config AuthKit). */
export interface DoctorInput {
  /** A config `authkit` resolvida pelo container, ou null se não resolver. */
  authkitConfig: Record<string, any> | null
  /** A config `session` do app (config('session')), ou null se ausente. */
  sessionConfig: Record<string, any> | null
  /** Resultado de tentar resolver cada peer (true = importável). */
  peers: {
    session: boolean
    shield: boolean
    ally: boolean
    limiter: boolean
  }
}

/** Type guard estrutural: o store expõe um método (capacidade presente). */
function has(store: any, method: string): boolean {
  return !!store && typeof store[method] === 'function'
}

/** config('authkit') resolve? */
export function checkConfigResolves(input: DoctorInput): Finding {
  if (!input.authkitConfig) {
    return {
      level: 'error',
      message: "config('authkit') did not resolve — config/authkit.ts is missing or invalid.",
    }
  }
  return { level: 'ok', message: "config('authkit') resolved." }
}

/** issuer é uma URL válida e seu pathname casa com o mountPath. */
export function checkIssuer(input: DoctorInput): Finding[] {
  const cfg = input.authkitConfig
  if (!cfg) return []
  const issuer: unknown = cfg.issuer
  const mountPath: string = cfg.mountPath ?? '/oidc'

  if (typeof issuer !== 'string' || issuer.length === 0) {
    return [{ level: 'error', message: 'issuer missing in config.' }]
  }

  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    return [{ level: 'error', message: `issuer is not a valid URL: "${issuer}".` }]
  }

  const findings: Finding[] = [{ level: 'ok', message: `valid issuer: ${url.origin}${url.pathname}` }]
  const normalize = (p: string) => (p.endsWith('/') ? p.slice(0, -1) : p) || '/'
  if (normalize(url.pathname) !== normalize(mountPath)) {
    findings.push({
      level: 'warn',
      message: `issuer pathname ("${url.pathname}") differs from mountPath ("${mountPath}"). OIDC routes may not match the URLs announced in discovery.`,
    })
  }
  return findings
}

/** Pelo menos um client com redirectUris. */
export function checkClients(input: DoctorInput): Finding {
  const cfg = input.authkitConfig
  if (!cfg) return { level: 'error', message: 'no config to validate clients.' }
  const clients = Array.isArray(cfg.clients) ? cfg.clients : []
  if (clients.length === 0) {
    return { level: 'error', message: 'no client configured in `clients`.' }
  }
  const withRedirects = clients.filter(
    (c: any) => Array.isArray(c?.redirectUris) && c.redirectUris.length > 0
  )
  if (withRedirects.length === 0) {
    return {
      level: 'error',
      message: `${clients.length} client(s) configured, but none has redirectUris.`,
    }
  }
  return { level: 'ok', message: `${withRedirects.length}/${clients.length} client(s) with redirectUris.` }
}

/** accountStore presente + quais capacidades implementa. */
export function checkAccountStore(input: DoctorInput): Finding[] {
  const cfg = input.authkitConfig
  if (!cfg) return []
  const store = cfg.accountStore
  if (!store) {
    return [{ level: 'error', message: 'accountStore missing — required.' }]
  }
  const findings: Finding[] = [{ level: 'ok', message: 'accountStore present.' }]
  const caps: string[] = []
  if (has(store, 'getMfaState')) caps.push('MFA')
  if (has(store, 'listPasskeys')) caps.push('passkeys/WebAuthn')
  if (has(store, 'findByProviderIdentity')) caps.push('account-linking')
  if (has(store, 'changePassword')) caps.push('account-security')
  if (has(store, 'isEmailVerified')) caps.push('email-verification-status')
  if (has(store, 'deleteAccount')) caps.push('account-deletion')
  findings.push({
    level: 'ok',
    message: caps.length
      ? `Optional capabilities: ${caps.join(', ')}.`
      : 'accountStore core only (no MFA/passkeys/linking/security).',
  })
  return findings
}

/** session provider configurado + warn se cookie store com tokenSets grandes. */
export function checkSession(input: DoctorInput): Finding[] {
  if (!input.peers.session) {
    return [
      {
        level: 'error',
        message: '@adonisjs/session is not importable — install it (required peer).',
      },
    ]
  }
  if (!input.sessionConfig) {
    return [{ level: 'warn', message: "config('session') missing — the session provider may not be configured." }]
  }
  const findings: Finding[] = [{ level: 'ok', message: 'session provider configured.' }]
  const driver = input.sessionConfig.store ?? input.sessionConfig.driver
  if (driver === 'cookie') {
    findings.push({
      level: 'warn',
      message: 'session store = cookie: large token sets may exceed the 4KB cookie limit. Prefer `redis`/`file` in production.',
    })
  }
  return findings
}

/** Hint de exceções de CSRF do shield para o mountPath. */
export function checkShield(input: DoctorInput): Finding {
  if (!input.peers.shield) {
    return { level: 'error', message: '@adonisjs/shield is not importable — install it (required peer).' }
  }
  const mountPath = input.authkitConfig?.mountPath ?? '/oidc'
  return {
    level: 'warn',
    message: `Make sure the IdP POST routes under "${mountPath}" are in the shield CSRF exceptions (e.g. the /token endpoint), otherwise server-to-server calls fail.`,
  }
}

/** ally só é necessário quando social está configurado. */
export function checkAlly(input: DoctorInput): Finding {
  const social = input.authkitConfig?.social
  const usesSocial = !!social && (Array.isArray(social.providers) ? social.providers.length > 0 : Object.keys(social).length > 0)
  if (!usesSocial) {
    return { level: 'ok', message: 'social login not configured — @adonisjs/ally is optional.' }
  }
  if (!input.peers.ally) {
    return { level: 'error', message: 'social login configured, but @adonisjs/ally is not importable.' }
  }
  return { level: 'ok', message: 'social login configured and @adonisjs/ally available.' }
}

/** rateLimit ligado mas @adonisjs/limiter ausente → warn. */
export function checkRateLimit(input: DoctorInput): Finding {
  const cfg = input.authkitConfig
  const rateLimit = cfg?.rateLimit
  const enabled = rateLimit === undefined ? true : rateLimit?.enabled !== false
  if (!enabled) {
    return { level: 'ok', message: 'rate-limiting disabled by config.' }
  }
  if (!input.peers.limiter) {
    return {
      level: 'warn',
      message: 'rate-limiting is on (default), but @adonisjs/limiter is not importable — becomes a no-op (no anti-brute-force protection).',
    }
  }
  return { level: 'ok', message: 'rate-limiting on and @adonisjs/limiter available.' }
}

/** admin.enabled mas sem roles → warn. */
export function checkAdmin(input: DoctorInput): Finding | null {
  const admin = input.authkitConfig?.admin
  if (!admin || admin.enabled !== true) return null
  const roles = Array.isArray(admin.roles) ? admin.roles : []
  if (roles.length === 0) {
    return {
      level: 'warn',
      message: 'admin console on, but no `admin.roles` — nobody will have access (the default ["ADMIN"] was not resolved here).',
    }
  }
  return { level: 'ok', message: `admin console on for roles: ${roles.join(', ')}.` }
}

/** requireVerifiedEmail ligado mas o store não sabe checar verificação → warn. */
export function checkRequireVerifiedEmail(input: DoctorInput): Finding | null {
  const cfg = input.authkitConfig
  const login = cfg?.login
  if (!login || login.requireVerifiedEmail !== true) return null
  const store = cfg?.accountStore
  if (!has(store, 'isEmailVerified')) {
    return {
      level: 'warn',
      message:
        'login.requireVerifiedEmail is on, but the accountStore has no `isEmailVerified` capability — the check is a no-op (nobody is blocked). Add an `email_verified_at` column (or a store that tracks it).',
    }
  }
  return { level: 'ok', message: 'login.requireVerifiedEmail on and the accountStore can check it.' }
}

/**
 * Bot protection (informativo): ativo quando `botProtection.verify` é uma função.
 * Reporta em quais ações está ligado e lembra da semântica fail-safe. Silencioso
 * quando não configurado.
 */
export function checkBotProtection(input: DoctorInput): Finding | null {
  const bot = input.authkitConfig?.botProtection
  if (!bot) return null
  if (typeof bot.verify !== 'function') {
    return {
      level: 'warn',
      message: 'botProtection is set but `verify` is not a function — the check is skipped (no protection).',
    }
  }
  const on = Array.isArray(bot.on) && bot.on.length > 0 ? bot.on : ['login', 'signup']
  return {
    level: 'ok',
    message: `bot protection on for: ${on.join(', ')} — fail-safe (verify errors/timeouts allow the request, availability over protection).`,
  }
}

/** webauthn rpId deve casar com o host do issuer. */
export function checkWebauthn(input: DoctorInput): Finding | null {
  const cfg = input.authkitConfig
  const webauthn = cfg?.webauthn
  if (!webauthn || !webauthn.rpId) return null
  const issuer: unknown = cfg.issuer
  if (typeof issuer !== 'string') return null
  let host: string
  try {
    host = new URL(issuer).hostname
  } catch {
    return null
  }
  if (webauthn.rpId !== host) {
    return {
      level: 'warn',
      message: `webauthn.rpId ("${webauthn.rpId}") differs from the issuer host ("${host}") — passkeys will not validate in the browser.`,
    }
  }
  return { level: 'ok', message: `webauthn.rpId matches the issuer host (${host}).` }
}

/**
 * Política de senha + checagem de vazamento (config do accountStore — opção
 * `password`). Valida o shape da policy e informa quando o HIBP está ligado. A
 * config vive no store (não no nível raiz da config authkit), então lemos de
 * `accountStore` quando o host a expõe via `__passwordConfig` (best-effort) — na
 * ausência, este check é silencioso (não falha).
 */
export function checkPasswordPolicy(input: DoctorInput): Finding | null {
  const store = input.authkitConfig?.accountStore
  const pwConfig = store?.__passwordConfig as
    | { policy?: Record<string, unknown>; checkPwned?: { enabled?: boolean } }
    | undefined
  if (!pwConfig) return null

  const policy = pwConfig.policy
  if (policy) {
    const minLength = policy.minLength
    if (minLength !== undefined && (typeof minLength !== 'number' || minLength < 1)) {
      return {
        level: 'warn',
        message: `password.policy.minLength is invalid (${String(minLength)}) — expected a positive number.`,
      }
    }
    if (typeof minLength === 'number' && minLength < 8) {
      return {
        level: 'warn',
        message: `password.policy.minLength is ${minLength} — values below 8 are discouraged.`,
      }
    }
  }

  if (pwConfig.checkPwned?.enabled) {
    return {
      level: 'ok',
      message:
        'password.checkPwned is on — new passwords are checked against HaveIBeenPwned (k-anonymity, fail-safe on network errors).',
    }
  }
  return { level: 'ok', message: 'password policy configured.' }
}

/** info sobre rotação quando jwks é managed; warn se managed sem store (sem rotação real). */
export function checkJwks(input: DoctorInput): Finding | null {
  const jwks = input.authkitConfig?.jwks
  if (!jwks) return null
  if (jwks.source === 'managed') {
    if (!jwks.store) {
      return {
        level: 'warn',
        message:
          'jwks managed WITHOUT a `store` — a fresh ephemeral key is generated each boot (tokens stop validating after a restart and `node ace authkit:keys:rotate` has no effect). Set `jwks.store` to persist and enable real rotation.',
      }
    }
    return {
      level: 'ok',
      message:
        'jwks managed with a persisted store — rotate the signing keys with `node ace authkit:keys:rotate` (--dry-run to preview, --retire to drop old keys, --keep=N for the grace window).',
    }
  }
  return { level: 'ok', message: 'jwks provided inline (source=jwks).' }
}

/**
 * Formato dos Access Tokens (RFC 9068). Informa o formato configurado e, no modo
 * JWT, lembra que o JWKS precisa ser estável (store persistido) para que os RPs
 * validem os ATs via jwks_uri através de reinícios/rotação.
 */
export function checkAccessTokens(input: DoctorInput): Finding | null {
  const cfg = input.authkitConfig
  const at = cfg?.accessTokens
  if (!at) return null
  const resources = at.resources ?? {}
  const resourceCount = Object.keys(resources).length
  const anyJwt = at.anyJwt ?? (at.format === 'jwt' || Object.values(resources).some((r: any) => r?.format === 'jwt'))

  if (!anyJwt) {
    return { level: 'ok', message: 'access tokens are opaque (default) — introspect them at the introspection endpoint.' }
  }

  const detail = resourceCount
    ? `format=${at.format}, ${resourceCount} resource(s) configured`
    : `format=jwt, audience=${at.audience}`
  const jwks = cfg?.jwks
  if (jwks?.source === 'managed' && !jwks.store) {
    return {
      level: 'warn',
      message: `JWT access tokens (RFC 9068) are on (${detail}), but jwks is managed WITHOUT a store — the signing key changes every boot, so issued JWT ATs stop validating after a restart. Set jwks.store.`,
    }
  }
  return {
    level: 'ok',
    message: `JWT access tokens (RFC 9068) are on (${detail}) — signed with the JWKS key, validable via jwks_uri (typ "at+jwt").`,
  }
}

/** Roda todos os checks e devolve a lista plana de findings. */
export function runAllChecks(input: DoctorInput): Finding[] {
  const findings: Finding[] = []
  findings.push(checkConfigResolves(input))
  findings.push(...checkIssuer(input))
  findings.push(checkClients(input))
  findings.push(...checkAccountStore(input))
  findings.push(...checkSession(input))
  findings.push(checkShield(input))
  findings.push(checkAlly(input))
  findings.push(checkRateLimit(input))
  const admin = checkAdmin(input)
  if (admin) findings.push(admin)
  const requireVerified = checkRequireVerifiedEmail(input)
  if (requireVerified) findings.push(requireVerified)
  const botProtection = checkBotProtection(input)
  if (botProtection) findings.push(botProtection)
  const webauthn = checkWebauthn(input)
  if (webauthn) findings.push(webauthn)
  const passwordPolicy = checkPasswordPolicy(input)
  if (passwordPolicy) findings.push(passwordPolicy)
  const jwks = checkJwks(input)
  if (jwks) findings.push(jwks)
  const accessTokens = checkAccessTokens(input)
  if (accessTokens) findings.push(accessTokens)
  return findings
}

/** Há algum finding de nível 'error'? (define o exit code). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'error')
}
