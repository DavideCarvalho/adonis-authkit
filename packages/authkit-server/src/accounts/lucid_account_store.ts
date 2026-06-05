import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AccountStore, AuthAccount } from './account_store.js'
import {
  type AccountSecretEncrypter,
  type LucidStoreContext,
  type WebauthnCeremonies,
} from './lucid_store/shared.js'
import { buildCore } from './lucid_store/core.js'
import { buildMfa } from './lucid_store/mfa.js'
import { buildProviderIdentity } from './lucid_store/provider_identity.js'
import { buildWebauthn } from './lucid_store/webauthn.js'
import {
  buildStatus,
  buildProfile,
  buildEmailVerificationStatus,
  buildDeletion,
  hasColumn,
} from './lucid_store/status_profile.js'
import { PasswordManager, type PasswordConfigInput } from '../password/password_manager.js'
import type { AuditSink } from '../audit/audit_sink.js'
import type { PwnedLogger, FetchLike } from '../password/pwned.js'

export type { AccountSecretEncrypter, WebauthnCeremonies }

/** Opções do {@link lucidAccountStore}. */
export interface LucidAccountStoreOptions {
  /** Label de issuer mostrado no app autenticador (keyuri). Default: 'AuthKit'. */
  mfaIssuer?: string
  /** Quantidade de recovery codes gerados no enrollment. Default: 8. */
  recoveryCodeCount?: number
  /**
   * Quando fornecido, o segredo TOTP é encriptado antes de persistir e
   * decriptado na leitura. Ausente (ex.: testes) → segredo em claro.
   */
  encrypter?: AccountSecretEncrypter
  /**
   * Model Lucid das identidades de provider (composto de `withProviderIdentity()`),
   * usado por `findByProviderIdentity`/`linkProviderIdentity` (account linking
   * social). Ausente → a capacidade de account linking fica AUSENTE do store (os
   * métodos não existem; hosts email-only continuam funcionando).
   */
  providerIdentityModel?: any
  /**
   * Model Lucid das credenciais WebAuthn / passkeys (composto de
   * `withWebauthnCredential()`), usado pelos métodos `*Passkey*`. Ausente → a
   * capacidade de passkeys fica AUSENTE do store (os métodos não existem; a UI
   * esconde a seção de passkeys).
   */
  webauthnCredentialModel?: any
  /**
   * Parâmetros do Relying Party (RP) usados nas cerimônias WebAuthn. Resolvidos a
   * partir do `issuer` no `define_config` quando omitidos. Necessários sempre que
   * `webauthnCredentialModel` é fornecido.
   */
  webauthn?: {
    /** Nome do RP mostrado pelo authenticator. Default: `mfaIssuer`. */
    rpName: string
    /** RP ID — normalmente o hostname (sem porta) do issuer. */
    rpId: string
    /** Origin(s) esperada(s) na verificação (scheme://host[:port]). */
    origin: string | string[]
  }
  /**
   * Seam de injeção das cerimônias WebAuthn (generate/verify). Default: as funções
   * reais do `@simplewebauthn/server`. Existe para testes (mockar a verificação SEM
   * um authenticator real) — produção não precisa fornecer.
   */
  webauthnCeremonies?: Partial<WebauthnCeremonies>
  /**
   * Gerência de senha: verificador de hashes legados (import de outros sistemas),
   * política de complexidade e checagem contra vazamentos (HIBP). Tudo opcional —
   * sem config, a política cai no default (min 8) e o lazy rehash usa só o hasher
   * nativo do model. Veja {@link PasswordConfigInput}.
   */
  password?: PasswordConfigInput
  /**
   * Sink de auditoria (best-effort), usado para emitir `password.rehashed` quando
   * o lazy rehash acontece. Ausente → o evento não é emitido. Normalmente o
   * `define_config` injeta o `audit` resolvido aqui.
   */
  audit?: AuditSink
  /**
   * Logger do app (subconjunto `warn`), usado pela checagem de vazamento para
   * registrar falhas fail-safe (timeout/rede). Ausente → silencioso.
   */
  logger?: PwnedLogger
  /**
   * Seam de injeção do cliente HTTP da checagem de vazamento (HIBP). Default: o
   * `fetch` nativo. Existe para testes — produção não precisa fornecer.
   */
  pwnedFetch?: FetchLike
}

/**
 * Implementação default do {@link AccountStore} sobre um model Lucid composto
 * de `withAuthUser()` + `withCredentials()` (+ opcionalmente `withMfa()`). O
 * model carrega `connection`/`table` (app-específico) e, por convenção, uma
 * coluna `fullName` (mapeada de `name`).
 *
 * Composição por CAPACIDADE: o núcleo + MFA são sempre montados; passkeys
 * (WebAuthn) e account linking por provider só são montados quando o model
 * correspondente é fornecido — caso contrário a capacidade fica ABSENTE (os
 * métodos não existem no objeto retornado, em vez de presentes-mas-lançando).
 */
export function lucidAccountStore(
  Model: any,
  options: LucidAccountStoreOptions = {}
): AccountStore {
  const mfaIssuer = options.mfaIssuer ?? 'AuthKit'
  const recoveryCodeCount = options.recoveryCodeCount ?? 8
  const encrypter = options.encrypter
  const ProviderIdentityModel = options.providerIdentityModel
  const WebauthnCredentialModel = options.webauthnCredentialModel
  // RP do WebAuthn: usado nas cerimônias. Default do rpName cai no mfaIssuer.
  const webauthn = options.webauthn ?? {
    rpName: mfaIssuer,
    rpId: 'localhost',
    origin: 'http://localhost',
  }
  // Cerimônias WebAuthn: reais por default, injetáveis para testes.
  const ceremonies: WebauthnCeremonies = {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
    ...options.webauthnCeremonies,
  }

  const passwords = new PasswordManager(options.password, {
    logger: options.logger,
    fetchImpl: options.pwnedFetch,
  })

  const ctx: LucidStoreContext = {
    Model,
    mfaIssuer,
    recoveryCodeCount,
    passwords,
    audit: options.audit,
    // Encripta o segredo antes de persistir (no-op sem encrypter).
    sealSecret: (secret: string) => (encrypter ? encrypter.encrypt(secret) : secret),
    // Decripta o segredo armazenado; retorna null em falha/adulteração (no-op sem encrypter).
    openSecret: (stored: string | null | undefined) => {
      if (!stored) return null
      if (!encrypter) return stored
      return encrypter.decrypt(stored)
    },
    toAccount: (row: any): AuthAccount => ({
      id: row.id,
      email: row.email,
      globalRoles: row.globalRoles ?? [],
      name: row.fullName ?? undefined,
      avatarUrl: row.avatarUrl ?? undefined,
    }),
  }

  // Núcleo + MFA são sempre presentes. Passkeys e provider-identity só entram
  // quando o model correspondente foi fornecido (capacidade genuinamente ausente
  // quando não configurada).
  return {
    ...buildCore(ctx),
    ...buildMfa(ctx),
    ...(ProviderIdentityModel ? buildProviderIdentity(ctx, ProviderIdentityModel) : {}),
    ...(WebauthnCredentialModel
      ? buildWebauthn(ctx, WebauthnCredentialModel, webauthn, ceremonies)
      : {}),
    // Status (disable/enable) só quando o model tem a coluna `disabled_at`.
    ...(hasColumn(Model, 'disabledAt') ? buildStatus(ctx) : {}),
    // Perfil (nome/avatar) só quando o model tem ao menos uma das colunas.
    ...(hasColumn(Model, 'fullName') || hasColumn(Model, 'avatarUrl')
      ? buildProfile(ctx)
      : {}),
    // Estado de verificação de e-mail (leitura) só quando o model tem a coluna.
    ...(hasColumn(Model, 'emailVerifiedAt') ? buildEmailVerificationStatus(ctx) : {}),
    // Deleção da conta: sempre disponível (qualquer model Lucid pode deletar).
    ...buildDeletion(ctx),
    // Config de senha resolvida — exposta (não-enumerável) para o authkit:doctor
    // inspecionar policy/checkPwned. NÃO faz parte do contrato AccountStore.
    __passwordConfig: passwords.config,
  } as AccountStore
}
