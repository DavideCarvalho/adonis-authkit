import type { HttpContext } from '@adonisjs/core/http'
import type { ResolvedServerConfig } from '../define_config.js'

/**
 * Bot protection plugável (CAPTCHA / challenge), agnóstica de vendor.
 *
 * O HOST fornece o verificador (`verify`); a lib só ORQUESTRA: injeta o widget
 * nas telas afetadas (login/signup/reset) e, no POST correspondente, extrai o
 * token do body e chama `verify` ANTES de processar credenciais. Nenhuma
 * dependência de Cloudflare Turnstile / hCaptcha / reCAPTCHA é trazida pela lib —
 * o host escreve o `verify` (um fetch ao endpoint do provedor) no `config/authkit.ts`.
 *
 * Decisão de disponibilidade (FAIL-SAFE): se `verify` LANÇAR ou estourar o
 * timeout, o fluxo PROSSEGUE (a verificação é tratada como "passou") e um warning
 * é logado. Disponibilidade > proteção: um provedor de CAPTCHA fora do ar não pode
 * derrubar o login de todo mundo. Apenas um `verify` que retorna `false`
 * explicitamente rejeita a request.
 *
 * @example Cloudflare Turnstile (código do HOST, sem dependência nova na lib):
 * ```ts
 * // config/authkit.ts
 * botProtection: {
 *   on: ['login', 'signup', 'reset'],
 *   widget: {
 *     scriptUrl: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
 *     // Container renderizado nas telas; o script do Turnstile o "hidrata".
 *     html: '<div class="cf-turnstile" data-sitekey="0xAAAA..."></div>',
 *   },
 *   async verify({ token, ip }) {
 *     if (!token) return false
 *     const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
 *       method: 'POST',
 *       headers: { 'content-type': 'application/x-www-form-urlencoded' },
 *       body: new URLSearchParams({
 *         secret: process.env.TURNSTILE_SECRET!,
 *         response: token,
 *         ...(ip ? { remoteip: ip } : {}),
 *       }),
 *     })
 *     const data = (await res.json()) as { success: boolean }
 *     return data.success === true
 *   },
 * }
 * ```
 *
 * @example hCaptcha (código do HOST):
 * ```ts
 * botProtection: {
 *   tokenFields: ['h-captcha-response'], // sobrescreve a lista default
 *   widget: {
 *     scriptUrl: 'https://js.hcaptcha.com/1/api.js',
 *     html: '<div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div>',
 *   },
 *   async verify({ token, ip }) {
 *     if (!token) return false
 *     const res = await fetch('https://api.hcaptcha.com/siteverify', {
 *       method: 'POST',
 *       headers: { 'content-type': 'application/x-www-form-urlencoded' },
 *       body: new URLSearchParams({
 *         secret: process.env.HCAPTCHA_SECRET!,
 *         response: token,
 *         ...(ip ? { remoteip: ip } : {}),
 *       }),
 *     })
 *     const data = (await res.json()) as { success: boolean }
 *     return data.success === true
 *   },
 * }
 * ```
 */

/** Ação protegida pelo bot protection (mapeia 1:1 com as telas/POSTs sensíveis). */
export type BotProtectionAction = 'login' | 'signup' | 'reset'

/** Contexto passado ao `verify` do host. */
export interface BotProtectionVerifyInput {
  /** Token do widget extraído do body (null quando ausente). */
  token: string | null
  /** IP da request (best-effort; pode ser undefined). */
  ip?: string
  /** Ação que disparou a verificação. */
  action: BotProtectionAction
}

/** Markup/script do widget injetado nas telas (Turnstile, hCaptcha, etc.). */
export interface BotProtectionWidget {
  /** URL do script externo do provedor (carregado uma vez, async). */
  scriptUrl: string
  /**
   * HTML do container do widget (renderizado RAW no form). Tipicamente um
   * `<div>` com a classe/atributos do provedor (ex.: `class="cf-turnstile"
   * data-sitekey="..."`). Como é config-trusted (do host), é injetado sem escape.
   */
  html: string
}

/**
 * Campos de body onde o token do widget costuma vir. Cobre os provedores comuns
 * por padrão; o host pode sobrescrever via `tokenFields`.
 *   - `cf-turnstile-response` (Cloudflare Turnstile)
 *   - `h-captcha-response`    (hCaptcha)
 *   - `g-recaptcha-response`  (Google reCAPTCHA)
 *   - `authkit-bot-token`     (genérico, p/ widgets custom)
 */
export const DEFAULT_BOT_TOKEN_FIELDS = [
  'cf-turnstile-response',
  'h-captcha-response',
  'g-recaptcha-response',
  'authkit-bot-token',
] as const

/** Config de entrada do bot protection (em `config/authkit.ts`). */
export interface BotProtectionConfigInput {
  /**
   * Verificador fornecido pelo HOST. Recebe o token do widget + contexto e
   * resolve `true` (humano/ok) ou `false` (bot/rejeitar). LANÇAR/timeout é
   * tratado como FAIL-SAFE (permite + warning) — ver {@link verifyBotProtection}.
   */
  verify: (input: BotProtectionVerifyInput) => Promise<boolean>
  /** Ações protegidas. Default: `['login', 'signup']`. */
  on?: BotProtectionAction[]
  /** Widget injetado nas telas (script + container). Opcional. */
  widget?: BotProtectionWidget
  /**
   * Nomes de campo de body onde procurar o token, em ordem. Default:
   * {@link DEFAULT_BOT_TOKEN_FIELDS}. O host pode passar uma lista própria.
   */
  tokenFields?: string[]
  /**
   * Timeout (ms) do `verify`. Estourar = FAIL-SAFE (permite). Default: 5000.
   */
  timeoutMs?: number
}

/** Config resolvida do bot protection (sempre com defaults aplicados). */
export interface ResolvedBotProtectionConfig {
  verify: (input: BotProtectionVerifyInput) => Promise<boolean>
  on: BotProtectionAction[]
  widget?: BotProtectionWidget
  tokenFields: string[]
  timeoutMs: number
}

/**
 * Resolve a config do bot protection aplicando os defaults. Retorna `undefined`
 * quando o host não configura `botProtection` (feature totalmente desligada).
 */
export function resolveBotProtection(
  input?: BotProtectionConfigInput
): ResolvedBotProtectionConfig | undefined {
  if (!input) return undefined
  const on = input.on && input.on.length > 0 ? input.on : (['login', 'signup'] as BotProtectionAction[])
  const tokenFields =
    input.tokenFields && input.tokenFields.length > 0
      ? input.tokenFields
      : [...DEFAULT_BOT_TOKEN_FIELDS]
  return {
    verify: input.verify,
    on,
    widget: input.widget,
    tokenFields,
    timeoutMs: input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : 5000,
  }
}

/** `true` se o bot protection está ligado para `action`. */
export function botProtectionApplies(
  cfg: ResolvedBotProtectionConfig | undefined,
  action: BotProtectionAction
): boolean {
  return !!cfg && cfg.on.includes(action)
}

/** Extrai o token do widget do body, testando os campos configurados em ordem. */
export function extractBotToken(ctx: HttpContext, fields: string[]): string | null {
  for (const field of fields) {
    const value = ctx.request.input(field)
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * Roda o `verify` do host com timeout e semântica FAIL-SAFE:
 *   - `verify` resolve `false`  → `false` (rejeitar a request).
 *   - `verify` resolve `true`   → `true`  (prosseguir).
 *   - `verify` LANÇA            → `true`  (FAIL-SAFE) + warning.
 *   - `verify` estoura o timeout→ `true`  (FAIL-SAFE) + warning.
 *
 * NUNCA lança para o caminho da request. Disponibilidade > proteção.
 */
export async function verifyBotProtection(
  ctx: HttpContext,
  cfg: ResolvedBotProtectionConfig,
  action: BotProtectionAction
): Promise<boolean> {
  const token = extractBotToken(ctx, cfg.tokenFields)
  const ip = ctx.request.ip?.() ?? undefined

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), cfg.timeoutMs)
  })

  try {
    const result = await Promise.race([cfg.verify({ token, ip, action }), timeout])
    return result
  } catch (error) {
    // FAIL-SAFE: erro no verificador do host NÃO bloqueia o login.
    ctx.logger.warn(
      { err: error, action },
      'authkit: bot protection verify lançou — fail-safe (request permitida)'
    )
    return true
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Verifica o bot protection para `action` e, em rejeição, AUDITA
 * `bot_protection.rejected` (sem o token). Retorna `false` quando a request deve
 * ser bloqueada (bot detectado). Best-effort: usado pelos controllers antes de
 * processar credenciais. Quando a feature não se aplica à ação, retorna `true`.
 */
export async function guardBotProtection(
  ctx: HttpContext,
  cfg: ResolvedServerConfig,
  action: BotProtectionAction,
  meta?: { email?: string | null; clientId?: string | null }
): Promise<boolean> {
  const bot = cfg.botProtection
  if (!botProtectionApplies(bot, action)) return true
  const ok = await verifyBotProtection(ctx, bot!, action)
  if (ok) return true
  // Rejeitado: audita SEM o token (apenas action + ip + contexto mínimo).
  await cfg.audit?.record({
    type: 'bot_protection.rejected',
    email: meta?.email ?? null,
    ip: ctx.request.ip?.() ?? null,
    clientId: meta?.clientId ?? null,
    metadata: { action },
  })
  return false
}
