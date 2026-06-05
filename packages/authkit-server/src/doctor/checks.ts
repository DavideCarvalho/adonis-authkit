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

/** info sobre rotação quando jwks é managed. */
export function checkJwks(input: DoctorInput): Finding | null {
  const jwks = input.authkitConfig?.jwks
  if (!jwks) return null
  if (jwks.source === 'managed') {
    return {
      level: 'ok',
      message: 'jwks managed — rotate the signing keys with `node ace authkit:rotate-keys` (use --store to persist across boots).',
    }
  }
  return { level: 'ok', message: 'jwks provided inline (source=jwks).' }
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
  const webauthn = checkWebauthn(input)
  if (webauthn) findings.push(webauthn)
  const jwks = checkJwks(input)
  if (jwks) findings.push(jwks)
  return findings
}

/** Há algum finding de nível 'error'? (define o exit code). */
export function hasErrors(findings: Finding[]): boolean {
  return findings.some((f) => f.level === 'error')
}
