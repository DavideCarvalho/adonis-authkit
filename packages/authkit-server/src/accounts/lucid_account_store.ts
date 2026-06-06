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
  hasTable,
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
import { buildOrganizations } from './lucid_store/organizations.js'
import { buildPasswordHistory, buildPasswordExpiration } from './lucid_store/password_hygiene.js'
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
  /**
   * Models Lucid para organizations (multi-tenancy). Quando os três forem fornecidos,
   * a capacidade `OrganizationsCapability` fica disponível no store. Os models devem
   * ser tabelas `auth_organizations`, `auth_organization_members` e
   * `auth_organization_invitations`. Ausente → capability AUSENTE (sem tabelas = desligado).
   */
  organizationModels?: {
    OrgModel: any
    MemberModel: any
    InvitationModel: any
  }
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
 *
 * @remarks Para capabilities que dependem de tabelas opcionais (ex.:
 *   `auth_password_history`), use {@link lucidAccountStoreAsync} que probe o DB
 *   e monta o store já com as capabilities detectadas, sem a necessidade de
 *   fornecer um model separado. A versão síncrona (`lucidAccountStore`) é mantida
 *   por back-compat — capabilities de tabela ficam AUSENTES nela.
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
  const OrgModels = options.organizationModels
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
    // nativeVerifyHash: usa o verifyPassword do model para verificar hashes históricos.
    nativeVerifyHash: async (hash: string, plain: string) => {
      // Cria uma instância temporária do model só para usar o método de hash.
      try {
        const tempRow = new Model()
        tempRow.password = hash
        // verifyPassword é injetado pelo mixin withAuthUser.
        if (typeof tempRow.verifyPassword === 'function') {
          return tempRow.verifyPassword(plain)
        }
        return false
      } catch {
        return false
      }
    },
  }

  // Núcleo + MFA são sempre presentes. Passkeys e provider-identity só entram
  // quando o model correspondente foi fornecido (capacidade genuinamente ausente
  // quando não configurada).
  const store = {
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
    // Expiração de senha: só quando o model tem a coluna `password_changed_at`.
    ...(hasColumn(Model, 'passwordChangedAt') ? buildPasswordExpiration(ctx) : {}),
    // Organizations (multi-tenancy): só quando os três models foram fornecidos.
    ...(OrgModels
      ? buildOrganizations({
          OrgModel: OrgModels.OrgModel,
          MemberModel: OrgModels.MemberModel,
          InvitationModel: OrgModels.InvitationModel,
          findAccountEmail: async (accountId: string) => {
            const row = await Model.find(accountId)
            return row?.email ?? null
          },
        })
      : {}),
    // Config de senha resolvida — exposta (não-enumerável) para o authkit:doctor
    // inspecionar policy/checkPwned. NÃO faz parte do contrato AccountStore.
    __passwordConfig: passwords.config,
    // Pepper configurado — exposto para o doctor verificar.
    __pepper: passwords.pepper,
    // PasswordManager exposto para controllers poderem aplicar pepper e verificar.
    __passwordManager: passwords,
    // Helper para o controller buscar o hash atual antes de gravar no histórico.
    __getRawRow: async (accountId: string) => {
      try { return await Model.find(accountId) } catch { return null }
    },
    /**
     * Nome da conexão Lucid usada por este store (deriva de `Model.connection`).
     * Exposto para que os call-sites de RuntimeSettings possam passar
     * `{ connection: store.connectionName }` e usar a conexão correta.
     * Undefined quando o model usa a conexão default (back-compat total).
     * NÃO faz parte do contrato AccountStore.
     */
    connectionName: (Model.connection as string | undefined) ?? undefined,
  } as AccountStore

  // Histórico de senhas: capability-probed via tabela `auth_password_history`.
  // A versão síncrona não pode fazer o probe de DB, então a capability fica
  // AUSENTE aqui. Use `lucidAccountStoreAsync` para probe automático, OU injete
  // o `passwordHistoryDb` nas options para montagem síncrona com DB explícito.
  const passwordHistoryDb = (options as any).passwordHistoryDb
  if (passwordHistoryDb) {
    Object.assign(store, buildPasswordHistory(ctx, passwordHistoryDb))
  }

  return store
}

/**
 * Options estendidas para uso em testes ou quando o DB é injetado diretamente
 * para o probe de histórico de senhas. Uso interno/avançado.
 */
export interface LucidAccountStoreAsyncOptions extends LucidAccountStoreOptions {
  /**
   * Instância de DB Lucid. Quando fornecida, o factory faz o probe da tabela
   * `auth_password_history` e monta a capability automaticamente.
   */
  db?: any
}

/**
 * Versão assíncrona do {@link lucidAccountStore} que faz o probe de DB para
 * detectar tabelas opcionais (`auth_password_history`) e monta as capabilities
 * correspondentes. Use esta versão quando o `db` está disponível no momento do
 * boot (ex.: no `register_auth_host.ts` ou no `app/providers/auth_provider.ts`).
 */
export async function lucidAccountStoreAsync(
  Model: any,
  options: LucidAccountStoreAsyncOptions = {}
): Promise<AccountStore> {
  const { db, ...rest } = options
  const base = lucidAccountStore(Model, rest)

  if (db) {
    // Probe da tabela auth_password_history.
    const historyPresent = await hasTable(db, 'auth_password_history')
    if (historyPresent) {
      const ctx: LucidStoreContext = {
        Model,
        mfaIssuer: options.mfaIssuer ?? 'AuthKit',
        recoveryCodeCount: options.recoveryCodeCount ?? 8,
        passwords: new PasswordManager(options.password, {
          logger: options.logger,
          fetchImpl: options.pwnedFetch,
        }),
        audit: options.audit,
        sealSecret: (s) => s,
        openSecret: (s) => s ?? null,
        toAccount: (row: any) => ({
          id: row.id,
          email: row.email,
          globalRoles: row.globalRoles ?? [],
          name: row.fullName ?? undefined,
          avatarUrl: row.avatarUrl ?? undefined,
        }),
      }
      Object.assign(base, buildPasswordHistory(ctx, db))
    }
  }

  return base
}

