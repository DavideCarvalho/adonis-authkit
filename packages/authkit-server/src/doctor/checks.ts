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
      message: "config('authkit') não resolveu — config/authkit.ts está ausente ou inválido.",
    }
  }
  return { level: 'ok', message: "config('authkit') resolvido." }
}

/** issuer é uma URL válida e seu pathname casa com o mountPath. */
export function checkIssuer(input: DoctorInput): Finding[] {
  const cfg = input.authkitConfig
  if (!cfg) return []
  const issuer: unknown = cfg.issuer
  const mountPath: string = cfg.mountPath ?? '/oidc'

  if (typeof issuer !== 'string' || issuer.length === 0) {
    return [{ level: 'error', message: 'issuer ausente na config.' }]
  }

  let url: URL
  try {
    url = new URL(issuer)
  } catch {
    return [{ level: 'error', message: `issuer não é uma URL válida: "${issuer}".` }]
  }

  const findings: Finding[] = [{ level: 'ok', message: `issuer válido: ${url.origin}${url.pathname}` }]
  const normalize = (p: string) => (p.endsWith('/') ? p.slice(0, -1) : p) || '/'
  if (normalize(url.pathname) !== normalize(mountPath)) {
    findings.push({
      level: 'warn',
      message: `O pathname do issuer ("${url.pathname}") difere do mountPath ("${mountPath}"). As rotas OIDC podem não casar com as URLs anunciadas no discovery.`,
    })
  }
  return findings
}

/** Pelo menos um client com redirectUris. */
export function checkClients(input: DoctorInput): Finding {
  const cfg = input.authkitConfig
  if (!cfg) return { level: 'error', message: 'sem config para validar clients.' }
  const clients = Array.isArray(cfg.clients) ? cfg.clients : []
  if (clients.length === 0) {
    return { level: 'error', message: 'nenhum client configurado em `clients`.' }
  }
  const withRedirects = clients.filter(
    (c: any) => Array.isArray(c?.redirectUris) && c.redirectUris.length > 0
  )
  if (withRedirects.length === 0) {
    return {
      level: 'error',
      message: `${clients.length} client(s) configurado(s), mas nenhum tem redirectUris.`,
    }
  }
  return { level: 'ok', message: `${withRedirects.length}/${clients.length} client(s) com redirectUris.` }
}

/** accountStore presente + quais capacidades implementa. */
export function checkAccountStore(input: DoctorInput): Finding[] {
  const cfg = input.authkitConfig
  if (!cfg) return []
  const store = cfg.accountStore
  if (!store) {
    return [{ level: 'error', message: 'accountStore ausente — obrigatório.' }]
  }
  const findings: Finding[] = [{ level: 'ok', message: 'accountStore presente.' }]
  const caps: string[] = []
  if (has(store, 'getMfaState')) caps.push('MFA')
  if (has(store, 'listPasskeys')) caps.push('passkeys/WebAuthn')
  if (has(store, 'findByProviderIdentity')) caps.push('account-linking')
  if (has(store, 'changePassword')) caps.push('account-security')
  findings.push({
    level: 'ok',
    message: caps.length
      ? `Capacidades opcionais: ${caps.join(', ')}.`
      : 'Apenas o núcleo do accountStore (sem MFA/passkeys/linking/security).',
  })
  return findings
}

/** session provider configurado + warn se cookie store com tokenSets grandes. */
export function checkSession(input: DoctorInput): Finding[] {
  if (!input.peers.session) {
    return [
      {
        level: 'error',
        message: '@adonisjs/session não é importável — instale-o (peer obrigatório).',
      },
    ]
  }
  if (!input.sessionConfig) {
    return [{ level: 'warn', message: "config('session') ausente — o provider de sessão pode não estar configurado." }]
  }
  const findings: Finding[] = [{ level: 'ok', message: 'provider de sessão configurado.' }]
  const driver = input.sessionConfig.store ?? input.sessionConfig.driver
  if (driver === 'cookie') {
    findings.push({
      level: 'warn',
      message: 'session store = cookie: token sets grandes podem estourar o limite de 4KB do cookie. Prefira `redis`/`file` em produção.',
    })
  }
  return findings
}

/** Hint de exceções de CSRF do shield para o mountPath. */
export function checkShield(input: DoctorInput): Finding {
  if (!input.peers.shield) {
    return { level: 'error', message: '@adonisjs/shield não é importável — instale-o (peer obrigatório).' }
  }
  const mountPath = input.authkitConfig?.mountPath ?? '/oidc'
  return {
    level: 'warn',
    message: `Garanta que as rotas POST do IdP sob "${mountPath}" estejam nas exceções de CSRF do shield (ex.: endpoint /token), senão chamadas server-to-server falham.`,
  }
}

/** ally só é necessário quando social está configurado. */
export function checkAlly(input: DoctorInput): Finding {
  const social = input.authkitConfig?.social
  const usesSocial = !!social && (Array.isArray(social.providers) ? social.providers.length > 0 : Object.keys(social).length > 0)
  if (!usesSocial) {
    return { level: 'ok', message: 'login social não configurado — @adonisjs/ally é opcional.' }
  }
  if (!input.peers.ally) {
    return { level: 'error', message: 'login social configurado, mas @adonisjs/ally não é importável.' }
  }
  return { level: 'ok', message: 'login social configurado e @adonisjs/ally disponível.' }
}

/** rateLimit ligado mas @adonisjs/limiter ausente → warn. */
export function checkRateLimit(input: DoctorInput): Finding {
  const cfg = input.authkitConfig
  const rateLimit = cfg?.rateLimit
  const enabled = rateLimit === undefined ? true : rateLimit?.enabled !== false
  if (!enabled) {
    return { level: 'ok', message: 'rate-limiting desligado por config.' }
  }
  if (!input.peers.limiter) {
    return {
      level: 'warn',
      message: 'rate-limiting está ligado (default), mas @adonisjs/limiter não é importável — vira no-op (sem proteção anti-brute-force).',
    }
  }
  return { level: 'ok', message: 'rate-limiting ligado e @adonisjs/limiter disponível.' }
}

/** admin.enabled mas sem roles → warn. */
export function checkAdmin(input: DoctorInput): Finding | null {
  const admin = input.authkitConfig?.admin
  if (!admin || admin.enabled !== true) return null
  const roles = Array.isArray(admin.roles) ? admin.roles : []
  if (roles.length === 0) {
    return {
      level: 'warn',
      message: 'console admin ligado, mas sem `admin.roles` — ninguém terá acesso (default ["ADMIN"] não foi resolvido aqui).',
    }
  }
  return { level: 'ok', message: `console admin ligado para roles: ${roles.join(', ')}.` }
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
      message: `webauthn.rpId ("${webauthn.rpId}") difere do host do issuer ("${host}") — as passkeys não validarão no browser.`,
    }
  }
  return { level: 'ok', message: `webauthn.rpId casa com o host do issuer (${host}).` }
}

/** info sobre rotação quando jwks é managed. */
export function checkJwks(input: DoctorInput): Finding | null {
  const jwks = input.authkitConfig?.jwks
  if (!jwks) return null
  if (jwks.source === 'managed') {
    return {
      level: 'ok',
      message: 'jwks managed — rotacione as chaves de assinatura com `node ace authkit:rotate-keys` (use --store para persistir entre boots).',
    }
  }
  return { level: 'ok', message: 'jwks fornecido inline (source=jwks).' }
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
