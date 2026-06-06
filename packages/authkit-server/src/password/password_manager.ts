import { createHmac } from 'node:crypto'
import {
  checkPasswordPolicy,
  policyViolationParams,
  resolvePasswordConfig,
  type PasswordPolicyInput,
  type CheckPwnedInput,
  type PasswordPolicyViolation,
  type ResolvedPasswordConfig,
} from './policy.js'
import { isPasswordPwned, type PwnedLogger, type FetchLike } from './pwned.js'

/**
 * Verificador de hashes legados (de OUTROS sistemas). Chamado quando a
 * verificação nativa do hasher do Adonis falha OU não reconhece o formato do
 * hash (ex.: bcrypt PHP `$2y$`, Django `pbkdf2_sha256$`, MD5, etc.).
 *
 * Retorno:
 *  - `true`  → a senha confere (o store então re-hasheia com o hasher atual);
 *  - `false` → a senha NÃO confere;
 *  - `null`  → este verifier não trata esse formato (deixa o login falhar).
 *
 * @example
 * // bcrypt vindo do PHP usa o prefixo `$2y$`; o hasher bcrypt do Node entende
 * // `$2b$`. A conversão é só trocar o prefixo (mesmo algoritmo):
 * const legacyVerifier = async (hashed, plain) => {
 *   if (!hashed.startsWith('$2y$')) return null // não é meu formato
 *   const normalized = '$2b$' + hashed.slice(4)
 *   return bcrypt.compare(plain, normalized) // true | false
 * }
 */
export type LegacyPasswordVerifier = (
  hashedPassword: string,
  plainPassword: string
) => Promise<boolean | null>

/** Config de senha aceita pelo store (entrada do host). */
export interface PasswordConfigInput {
  /**
   * Verificador de hashes legados de outros sistemas. Acionado quando a
   * verificação nativa falha. Veja {@link LegacyPasswordVerifier}.
   */
  legacyVerifier?: LegacyPasswordVerifier
  /** Política de complexidade aplicada a TODA senha nova. */
  policy?: PasswordPolicyInput
  /**
   * Checagem contra vazamentos (HaveIBeenPwned, k-anonymity). `true` usa os
   * defaults; um objeto ajusta o `timeoutMs`. Fail-safe (erro/timeout permite).
   */
  checkPwned?: CheckPwnedInput
  /**
   * Pepper de infra (segredo de boot). HMAC-SHA256 da senha ANTES do hasher
   * seguindo OWASP (defense-in-depth: DB comprometido sem o pepper = hashes
   * inúteis).
   *
   * - `string`  → pepper corrente.
   * - `string[]` → rotação: o PRIMEIRO é o corrente (hash); TODOS são tentados
   *   no verify. Se confere com um pepper antigo → lazy re-hash com o corrente.
   * - Ausente → comportamento original (sem HMAC, back-compat total).
   *
   * IMPORTANTE: Contas existentes podem ter hash SEM pepper — o verify tenta
   * com cada pepper E sem pepper (legacy); em sucesso re-hasheia com o corrente.
   *
   * @example
   * // config/authkit.ts
   * password: { pepper: env.get('PASSWORD_PEPPER') }
   *
   * @example
   * // Rotação: novo pepper primeiro, antigos no array.
   * password: { pepper: [env.get('PEPPER_V2'), env.get('PEPPER_V1')] }
   */
  pepper?: string | string[]
}

/** Erro de política/vazamento de senha — carrega a chave i18n + params. */
export class PasswordPolicyError extends Error {
  constructor(
    readonly key: PasswordPolicyViolation | 'password.pwned' | 'password.reused',
    readonly params?: Record<string, string | number>
  ) {
    super(key)
    this.name = 'PasswordPolicyError'
  }
}

// ---------------------------------------------------------------------------
// Pepper helpers (OWASP pattern: HMAC-SHA256 before hashing)
// ---------------------------------------------------------------------------

/**
 * Aplica o pepper à senha em claro via HMAC-SHA256, retornando um hex-digest
 * que será entregue ao hasher como se fosse a senha. Sem pepper → retorna a
 * senha inalterada (back-compat total).
 */
export function applyPepper(plain: string, pepper: string): string {
  return createHmac('sha256', pepper).update(plain).digest('hex')
}

/**
 * Resolve o array de peppers a tentar no verify, incluindo o sentinel "sem
 * pepper" (cadeia vazia) para back-compat com hashes antigos sem pepper.
 *
 * @returns [corrente, ...antigos, ''] — string vazia = tentar sem HMAC (legacy).
 */
export function resolvePeppers(pepper: string | string[] | undefined): string[] {
  if (!pepper) return ['']
  const arr = Array.isArray(pepper) ? pepper : [pepper]
  // Inclui string vazia no final para tentar sem pepper (legacy back-compat).
  return [...arr, '']
}

/**
 * Aplica o pepper corrente à senha em claro. O pepper corrente é SEMPRE o
 * primeiro do array (ou a string direta). Sem pepper → retorna a senha.
 */
export function applyCurrentPepper(plain: string, pepper: string | string[] | undefined): string {
  if (!pepper) return plain
  const current = Array.isArray(pepper) ? pepper[0] : pepper
  if (!current) return plain
  return applyPepper(plain, current)
}

/**
 * Resultado de uma verificação de senha pelo manager. `rehash` indica que a
 * senha confere mas o hash armazenado deve ser re-gerado (formato legado OU
 * parâmetros do hasher desatualizados) — o chamador (store) persiste o novo hash
 * best-effort.
 */
export interface PasswordVerifyResult {
  ok: boolean
  rehash: boolean
}

/**
 * Concentra a lógica de senha do store: validação de política + vazamento (ao
 * DEFINIR uma senha) e verificação com lazy rehash + legacy verifier (ao
 * AUTENTICAR). É construído a partir da config do host; sem config, a política
 * cai no default (min 8) e nada mais é exigido.
 */
export class PasswordManager {
  readonly config: ResolvedPasswordConfig
  private readonly legacyVerifier?: LegacyPasswordVerifier
  private readonly logger?: PwnedLogger
  private readonly fetchImpl?: FetchLike
  /** Pepper configurado (secret de boot). Pode ser string ou array para rotação. */
  readonly pepper: string | string[] | undefined

  constructor(
    input: PasswordConfigInput = {},
    deps: { logger?: PwnedLogger; fetchImpl?: FetchLike } = {}
  ) {
    this.config = resolvePasswordConfig(input)
    this.legacyVerifier = input.legacyVerifier
    this.logger = deps.logger
    this.fetchImpl = deps.fetchImpl
    this.pepper = input.pepper
  }

  /** Há um verificador de hash legado configurado? */
  hasLegacyVerifier(): boolean {
    return typeof this.legacyVerifier === 'function'
  }

  /**
   * Aplica o pepper corrente à senha em claro antes do hash. Sem pepper →
   * retorna a senha inalterada (back-compat total).
   */
  applyCurrentPepper(plain: string): string {
    return applyCurrentPepper(plain, this.pepper)
  }

  /**
   * Valida uma senha NOVA: política primeiro (barata, local), depois vazamento
   * (rede, opcional, fail-safe). Lança {@link PasswordPolicyError} na 1ª falha.
   */
  async assertAcceptable(plainPassword: string): Promise<void> {
    const violation = checkPasswordPolicy(plainPassword, this.config.policy)
    if (violation) {
      throw new PasswordPolicyError(violation, policyViolationParams(violation, this.config.policy))
    }
    if (this.config.checkPwned.enabled) {
      const pwned = await isPasswordPwned(plainPassword, {
        timeoutMs: this.config.checkPwned.timeoutMs,
        logger: this.logger,
        fetchImpl: this.fetchImpl,
      })
      if (pwned) throw new PasswordPolicyError('password.pwned')
    }
  }

  /**
   * Verifica `plainPassword` contra o `hashedPassword` armazenado, com suporte
   * a pepper.
   *
   * Sequência:
   *  1. Para cada pepper possível (corrente + antigos + sem pepper para legacy):
   *     a. `nativeVerify(hashed, peppered(plain))`. Se OK → checa `needsRehash`
   *        e devolve `{ ok: true, rehash }`. rehash=true quando pepper não é o
   *        corrente (re-hash com o corrente transparente).
   *  2. Se nenhum pepper funcionou com native, tenta o `legacyVerifier` com
   *     `applyCurrentPepper(plain)` (e também sem pepper, para import de sistemas
   *     legados antes de pepperar).
   *     `true` → `{ ok: true, rehash: true }`;
   *     `false`/`null` → `{ ok: false, rehash: false }`.
   *
   * `nativeVerify`/`needsRehash` são injetados pelo store (vêm do model Lucid),
   * mantendo este manager desacoplado do Lucid.
   */
  async verify(
    hashedPassword: string,
    plainPassword: string,
    hooks: {
      nativeVerify: (hashed: string, plain: string) => Promise<boolean>
      needsRehash: (hashed: string) => boolean
    }
  ): Promise<PasswordVerifyResult> {
    const peppers = resolvePeppers(this.pepper)
    const currentPepper = Array.isArray(this.pepper) ? this.pepper[0] : (this.pepper ?? '')

    for (let i = 0; i < peppers.length; i++) {
      const p = peppers[i]
      const peppered = p ? applyPepper(plainPassword, p) : plainPassword
      let nativeOk = false
      try {
        nativeOk = await hooks.nativeVerify(hashedPassword, peppered)
      } catch {
        nativeOk = false
      }
      if (nativeOk) {
        // Se este não é o pepper corrente → re-hash obrigatório com o corrente.
        const isCurrentPepper = (p === currentPepper) || (!p && !this.pepper)
        let rehash = isCurrentPepper ? false : true
        if (!rehash) {
          try {
            rehash = hooks.needsRehash(hashedPassword)
          } catch {
            rehash = false
          }
        }
        return { ok: true, rehash }
      }
    }

    // Nenhum pepper funcionou com nativeVerify → tenta legacyVerifier.
    if (this.legacyVerifier) {
      // Tenta com o pepper corrente E sem pepper (para hashes de sistemas legados
      // que ainda não tinham pepper).
      const tryCandidates = this.pepper
        ? [applyCurrentPepper(plainPassword, this.pepper), plainPassword]
        : [plainPassword]

      for (const candidate of tryCandidates) {
        let legacy: boolean | null = null
        try {
          legacy = await this.legacyVerifier(hashedPassword, candidate)
        } catch {
          legacy = null
        }
        if (legacy === true) return { ok: true, rehash: true }
      }
    }

    return { ok: false, rehash: false }
  }
}
