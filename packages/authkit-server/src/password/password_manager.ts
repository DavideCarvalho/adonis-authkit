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
}

/** Erro de política/vazamento de senha — carrega a chave i18n + params. */
export class PasswordPolicyError extends Error {
  constructor(
    readonly key: PasswordPolicyViolation | 'password.pwned',
    readonly params?: Record<string, string | number>
  ) {
    super(key)
    this.name = 'PasswordPolicyError'
  }
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

  constructor(
    input: PasswordConfigInput = {},
    deps: { logger?: PwnedLogger; fetchImpl?: FetchLike } = {}
  ) {
    this.config = resolvePasswordConfig(input)
    this.legacyVerifier = input.legacyVerifier
    this.logger = deps.logger
    this.fetchImpl = deps.fetchImpl
  }

  /** Há um verificador de hash legado configurado? */
  hasLegacyVerifier(): boolean {
    return typeof this.legacyVerifier === 'function'
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
   * Verifica `plainPassword` contra o `hashedPassword` armazenado.
   *
   * Sequência:
   *  1. `nativeVerify(hashed, plain)` (hasher atual do model). Se OK → checa
   *     `needsRehash` (parâmetros desatualizados) e devolve `{ ok: true, rehash }`.
   *  2. Se a verificação nativa falha, tenta o `legacyVerifier` (quando há um).
   *     `true` → `{ ok: true, rehash: true }` (re-hasheia com o hasher atual);
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
    let nativeOk = false
    try {
      nativeOk = await hooks.nativeVerify(hashedPassword, plainPassword)
    } catch {
      // verify nunca deve derrubar o login: trata como falha e segue para legacy.
      nativeOk = false
    }
    if (nativeOk) {
      let rehash = false
      try {
        rehash = hooks.needsRehash(hashedPassword)
      } catch {
        rehash = false
      }
      return { ok: true, rehash }
    }

    if (this.legacyVerifier) {
      let legacy: boolean | null = null
      try {
        legacy = await this.legacyVerifier(hashedPassword, plainPassword)
      } catch {
        legacy = null
      }
      if (legacy === true) return { ok: true, rehash: true }
    }

    return { ok: false, rehash: false }
  }
}
