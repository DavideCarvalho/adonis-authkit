/**
 * Política de senha configurável (server-side) + checagem contra vazamentos
 * (HaveIBeenPwned, k-anonymity). Tudo aqui é PURO e testável em isolamento:
 * recebe a config resolvida e a senha em claro, devolve o veredito. A aplicação
 * (signup/reset/troca de senha) e a tradução das mensagens ficam a cargo dos
 * controllers/stores.
 */

/**
 * Regras de complexidade exigidas de uma senha nova.
 * @deprecated Gerencie via runtime setting `password_policy` no admin console ou Admin API.
 * Estes campos continuam funcionando como fallback enquanto a setting não estiver presente.
 */
export interface PasswordPolicyInput {
  /**
   * Comprimento mínimo. Default: 8.
   * @deprecated Gerencie via runtime setting `password_policy`.
   */
  minLength?: number
  /**
   * Exige ao menos uma letra maiúscula. Default: false.
   * @deprecated Gerencie via runtime setting `password_policy`.
   */
  requireUppercase?: boolean
  /**
   * Exige ao menos uma letra minúscula. Default: false.
   * @deprecated Gerencie via runtime setting `password_policy`.
   */
  requireLowercase?: boolean
  /**
   * Exige ao menos um dígito. Default: false.
   * @deprecated Gerencie via runtime setting `password_policy`.
   */
  requireNumbers?: boolean
  /**
   * Exige ao menos um símbolo (não alfanumérico). Default: false.
   * @deprecated Gerencie via runtime setting `password_policy`.
   */
  requireSymbols?: boolean
}

/** Política resolvida (todos os campos presentes). */
export interface ResolvedPasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSymbols: boolean
}

/**
 * Checagem contra vazamentos (HaveIBeenPwned Range API, k-anonymity). Quando
 * `true`, usa os defaults; um objeto permite ajustar o timeout. FAIL-SAFE: erro
 * de rede/timeout/5xx NÃO bloqueia a senha (loga warning e permite).
 */
export type CheckPwnedInput = boolean | { timeoutMs?: number }

/** Config de senha resolvida, carregada pelo store/controllers. */
export interface ResolvedPasswordConfig {
  policy: ResolvedPasswordPolicy
  checkPwned: { enabled: boolean; timeoutMs: number }
}

export const DEFAULT_PWNED_TIMEOUT_MS = 2000

/**
 * Chave i18n da regra de política violada (estável — os catálogos en/pt-BR
 * carregam todas). `password.pwned` é a mensagem do vazamento.
 */
export type PasswordPolicyViolation =
  | 'password.policy.min_length'
  | 'password.policy.uppercase'
  | 'password.policy.lowercase'
  | 'password.policy.numbers'
  | 'password.policy.symbols'

export function resolvePasswordPolicy(input?: PasswordPolicyInput): ResolvedPasswordPolicy {
  return {
    minLength: input?.minLength ?? 8,
    requireUppercase: input?.requireUppercase ?? false,
    requireLowercase: input?.requireLowercase ?? false,
    requireNumbers: input?.requireNumbers ?? false,
    requireSymbols: input?.requireSymbols ?? false,
  }
}

export function resolveCheckPwned(input?: CheckPwnedInput): { enabled: boolean; timeoutMs: number } {
  if (!input) return { enabled: false, timeoutMs: DEFAULT_PWNED_TIMEOUT_MS }
  if (input === true) return { enabled: true, timeoutMs: DEFAULT_PWNED_TIMEOUT_MS }
  return { enabled: true, timeoutMs: input.timeoutMs ?? DEFAULT_PWNED_TIMEOUT_MS }
}

export function resolvePasswordConfig(input?: {
  policy?: PasswordPolicyInput
  checkPwned?: CheckPwnedInput
}): ResolvedPasswordConfig {
  return {
    policy: resolvePasswordPolicy(input?.policy),
    checkPwned: resolveCheckPwned(input?.checkPwned),
  }
}

/**
 * Aplica a política a uma senha em claro. Devolve a PRIMEIRA violação (chave
 * i18n) ou `null` se a senha passa. Ordem estável: comprimento → maiúscula →
 * minúscula → dígito → símbolo.
 */
export function checkPasswordPolicy(
  password: string,
  policy: ResolvedPasswordPolicy
): PasswordPolicyViolation | null {
  if (password.length < policy.minLength) return 'password.policy.min_length'
  if (policy.requireUppercase && !/[A-Z]/.test(password)) return 'password.policy.uppercase'
  if (policy.requireLowercase && !/[a-z]/.test(password)) return 'password.policy.lowercase'
  if (policy.requireNumbers && !/[0-9]/.test(password)) return 'password.policy.numbers'
  if (policy.requireSymbols && !/[^A-Za-z0-9]/.test(password)) return 'password.policy.symbols'
  return null
}

/**
 * Parâmetros para interpolar a mensagem i18n da violação (ex.: `{min}` no
 * comprimento mínimo). Devolve `undefined` para regras sem parâmetro.
 */
export function policyViolationParams(
  violation: PasswordPolicyViolation,
  policy: ResolvedPasswordPolicy
): Record<string, string | number> | undefined {
  if (violation === 'password.policy.min_length') return { min: policy.minLength }
  return undefined
}
