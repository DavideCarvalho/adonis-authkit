/** DTO público da conta — o que o provider e os controllers enxergam. Nunca um model Lucid. */
export interface AuthAccount {
  id: string
  email: string
  globalRoles?: string[]
  name?: string
  avatarUrl?: string
}

export interface CreateAccountInput {
  email: string
  password: string
  fullName?: string | null
  globalRoles?: string[]
  /** social/Google entra como true (provider já verificou o email). Default: false. */
  emailVerified?: boolean
}

/** Dados para ligar uma identidade de provider a uma conta. */
export interface LinkProviderIdentityInput {
  accountId: string
  provider: string
  providerUserId: string
  email?: string
}

/** Parâmetros de listagem paginada de contas (console admin). */
export interface ListAccountsParams {
  /** Filtro por e-mail (substring, case-insensitive). */
  search?: string
  /** Página (1-based). Default: 1. */
  page?: number
  /** Itens por página. Default: 20. */
  limit?: number
}

/** Página de resultados + total absoluto (para paginação na UI). */
export interface Paginated<T> {
  data: T[]
  total: number
}

/**
 * Resumo de uma passkey (credencial WebAuthn) para exibição na UI de gerência.
 * Nunca expõe a chave pública nem o counter.
 */
export interface PasskeySummary {
  /** Credential id (base64url). */
  id: string
  /** Rótulo legível opcional (ex.: nome do dispositivo). */
  label?: string
  /** ISO timestamp de criação. */
  createdAt: string
}

/**
 * Núcleo SEMPRE presente do store de contas: identidade (findById/verifyCredentials),
 * cadastro, reset de senha, verificação de e-mail e administração (listagem/roles).
 *
 * As demais funcionalidades (MFA, passkeys/WebAuthn, account linking por provider)
 * são CAPACIDADES separadas e opcionais — um store pode implementá-las ou não. Veja
 * {@link MfaCapability}, {@link WebauthnCapability}, {@link ProviderIdentityCapability}.
 * O tipo composto usado pela config é {@link AccountStore}.
 */
export interface CoreAccountStore extends AdminCapability {
  // Provider-facing
  findById(id: string): Promise<AuthAccount | null>
  verifyCredentials(email: string, password: string): Promise<AuthAccount | null>
  // Cadastro / social
  findByEmail(email: string): Promise<AuthAccount | null>
  create(input: CreateAccountInput): Promise<AuthAccount>
  // Reset de senha
  issuePasswordResetToken(email: string): Promise<{ token: string; account: AuthAccount } | null>
  consumePasswordResetToken(token: string, newPassword: string): Promise<boolean>
  // Verificação de e-mail
  issueEmailVerificationToken(email: string): Promise<{ token: string; account: AuthAccount } | null>
  consumeEmailVerificationToken(token: string): Promise<boolean>
}

/**
 * Administração (console admin opt-in — B6). Hoje faz parte do núcleo (os stores
 * default sempre a implementam e os controllers admin a chamam direto), mas é
 * modelada como capacidade própria para clareza e futura granularidade.
 */
export interface AdminCapability {
  /** Lista contas paginadas, opcionalmente filtrando por e-mail. */
  listAccounts(params: ListAccountsParams): Promise<Paginated<AuthAccount>>
  /** Substitui as roles globais de uma conta. */
  setGlobalRoles(accountId: string, roles: string[]): Promise<void>
}

/**
 * Self-service de segurança da conta (console de conta): trocar a senha e o
 * e-mail (com confirmação no NOVO endereço). É uma CAPACIDADE opcional — stores
 * sem suporte omitem os métodos e a UI esconde a seção correspondente.
 *
 * A troca de e-mail usa um token de confirmação que viaja para o NOVO endereço
 * ({@link requestEmailChange}) e é consumido por {@link confirmEmailChange}. O
 * store default (Lucid) reaproveita a coluna `emailVerificationToken` codificando
 * um payload `ec:<email>:<token>` — assim NÃO exige migração nova (ver
 * `lucid_store/core.ts`). O tradeoff é que um token de verificação de cadastro e
 * um de troca de e-mail não coexistem (mesma coluna); na prática são fluxos
 * distintos no tempo.
 */
export interface AccountSecurityCapability {
  /**
   * Define uma nova senha para a conta (após o controller confirmar a senha ATUAL
   * via {@link CoreAccountStore.verifyCredentials}). Retorna false se a conta não
   * existe.
   */
  changePassword(accountId: string, newPassword: string): Promise<boolean>
  /**
   * Inicia a troca de e-mail: gera um token de confirmação para o `newEmail` e o
   * persiste. Retorna o token + a conta, ou null se a conta não existe OU se o
   * `newEmail` já pertence a outra conta.
   */
  requestEmailChange(
    accountId: string,
    newEmail: string
  ): Promise<{ token: string; account: AuthAccount; newEmail: string } | null>
  /**
   * Confirma a troca de e-mail consumindo o token (single-use). Em caso de
   * sucesso aplica o novo e-mail, marca-o como verificado e limpa o token.
   * Retorna `{ ok: true, account, newEmail }` ou `{ ok: false }`.
   */
  confirmEmailChange(
    token: string
  ): Promise<{ ok: true; account: AuthAccount; newEmail: string } | { ok: false }>
}

/**
 * Status da conta (habilitar/desabilitar) — usado pelo console admin para
 * suspender uma conta sem apagá-la. É uma CAPACIDADE opcional: stores sem suporte
 * omitem os métodos e a UI esconde os botões de disable/enable. Quando suportada,
 * os fluxos de login (interaction OIDC + console de conta) DEVEM rejeitar contas
 * desabilitadas (ver `attemptPasswordLogin`).
 *
 * O store default (Lucid) implementa via uma coluna `disabled_at` (timestamp
 * nullable) NO model — quando a coluna existe (probe em `$columnsDefinitions`); se
 * o model não a tiver, a capacidade fica genuinamente ausente (nenhum método é
 * montado) e a UI esconde os botões. Hosts adicionam a coluna por migração própria
 * (mesmo padrão documentado das demais colunas opcionais).
 */
export interface AccountStatusCapability {
  /** Desabilita a conta (impede login). No-op se a conta não existe. */
  disableAccount(accountId: string): Promise<void>
  /** Reabilita a conta. No-op se a conta não existe. */
  enableAccount(accountId: string): Promise<void>
  /** Indica se a conta está desabilitada (false se a conta não existe). */
  isDisabled(accountId: string): Promise<boolean>
}

/**
 * Edição do perfil próprio (console de conta): nome e avatar. CAPACIDADE opcional;
 * stores sem suporte omitem o método e a UI esconde a seção. O store default
 * (Lucid) grava nas colunas `full_name`/`avatar_url` do model — apenas as que
 * existirem (probe em `$columnsDefinitions`).
 */
export interface ProfileCapability {
  /**
   * Atualiza o perfil da conta. Campos `undefined` são deixados como estão;
   * `null` limpa o valor. Retorna a conta atualizada ou null se inexistente.
   */
  updateProfile(
    accountId: string,
    patch: { name?: string | null; avatarUrl?: string | null }
  ): Promise<AuthAccount | null>
}

/**
 * Account linking por identidade de provider (Google, GitHub, …).
 * `(provider, providerUserId)` é a chave estável vinda do provider OAuth — não
 * depende do e-mail (que pode mudar / não estar presente). Uma conta pode ter
 * várias identidades. Stores sem suporte simplesmente NÃO expõem estes métodos
 * (a capacidade fica ausente) — não há fallback que lança.
 */
export interface ProviderIdentityCapability {
  /** Acha a conta ligada a uma identidade de provider; null se desconhecida. */
  findByProviderIdentity(provider: string, providerUserId: string): Promise<AuthAccount | null>
  /** Liga (upsert idempotente na chave única) uma identidade de provider a uma conta. */
  linkProviderIdentity(data: LinkProviderIdentityInput): Promise<void>
  /**
   * Remove TODAS as identidades de provider ligadas a uma conta (usado na deleção
   * de conta — LGPD). Retorna quantas foram removidas. No-op (0) se a conta não tem
   * identidades.
   */
  unlinkAllProviderIdentities(accountId: string): Promise<number>
  /**
   * Lista as identidades de provider de uma conta (usado no export de dados —
   * LGPD). NUNCA expõe tokens/segredos do provider — só provider + providerUserId +
   * email (quando presente).
   */
  listProviderIdentities(accountId: string): Promise<ProviderIdentitySummary[]>
}

/** Resumo de uma identidade de provider para export/exibição (sem tokens). */
export interface ProviderIdentitySummary {
  provider: string
  providerUserId: string
  email?: string | null
}

/**
 * MFA / TOTP. Stores sem suporte a MFA omitem a capacidade inteira; o interaction
 * flow trata a ausência como "MFA desligado".
 */
export interface MfaCapability {
  /**
   * Estado do MFA da conta (se o desafio TOTP deve ser exigido no login).
   * `enabledAt` (epoch ms) é o instante em que o MFA foi (re)enrolado, usado pelo
   * mecanismo de "trusted devices": um cookie de confiança emitido ANTES desse
   * instante é considerado inválido (re-enrolar MFA revoga a confiança). Pode ser
   * `null`/ausente quando o MFA não está ativo ou o store não rastreia o instante.
   */
  getMfaState(accountId: string): Promise<{ enabled: boolean; enabledAt?: number | null }>
  /**
   * Inicia o enrollment TOTP: gera um segredo PENDENTE (mfaEnabledAt continua
   * null) e devolve o segredo + otpauth URI (keyuri). Não ativa o MFA ainda.
   */
  startTotpEnrollment(accountId: string): Promise<{ secret: string; otpauthUri: string } | null>
  /**
   * Confirma o enrollment: verifica o código contra o segredo pendente; em caso
   * de sucesso ativa o MFA, gera N recovery codes e devolve os códigos em claro
   * (uma única vez).
   */
  confirmTotpEnrollment(
    accountId: string,
    code: string
  ): Promise<{ ok: boolean; recoveryCodes?: string[] }>
  /** Verifica um código TOTP contra o segredo ativo. */
  verifyTotp(accountId: string, code: string): Promise<boolean>
  /** Consome (single-use) um recovery code; true se casou e foi removido. */
  consumeRecoveryCode(accountId: string, code: string): Promise<boolean>
  /** Desliga o MFA: limpa segredo + mfaEnabledAt + recovery codes. */
  disableMfa(accountId: string): Promise<void>
}

/**
 * MFA / WebAuthn (passkeys) — 2º fator alternativo ao TOTP. Como o TOTP, é uma
 * capacidade INTEIRA opcional: stores sem suporte a passkeys não a expõem e a UI
 * esconde a seção de passkeys. O `expectedChallenge` é gerado no begin
 * (generate*Options) e DEVE ser guardado pelo controller (na sessão) para ser
 * passado de volta no finish (verify*) — o store não mantém estado de desafio
 * entre as chamadas.
 */
export interface WebauthnCapability {
  /**
   * Inicia o registro de uma passkey: gera as opções de criação
   * (`generateRegistrationOptions`) escopadas à conta (e excluindo credenciais já
   * registradas). Devolve as opções JSON (o controller serializa pro browser) e o
   * `challenge` (base64url) para guardar na sessão. null = conta inexistente.
   */
  generatePasskeyRegistrationOptions(
    accountId: string
  ): Promise<{ options: Record<string, unknown>; challenge: string } | null>
  /**
   * Finaliza o registro: verifica a resposta do browser
   * (`verifyRegistrationResponse`) contra o `expectedChallenge` guardado. Em caso
   * de sucesso persiste a credencial (id, publicKey, counter, transports) e
   * habilita o MFA. Retorna true se registrou.
   */
  verifyPasskeyRegistration(
    accountId: string,
    response: unknown,
    expectedChallenge: string
  ): Promise<boolean>
  /**
   * Inicia a autenticação por passkey no login: gera as opções
   * (`generateAuthenticationOptions`) restritas às credenciais da conta. Devolve
   * as opções JSON + o `challenge` para guardar na sessão. null = conta sem passkeys.
   */
  generatePasskeyAuthenticationOptions(
    accountId: string
  ): Promise<{ options: Record<string, unknown>; challenge: string } | null>
  /**
   * Verifica a resposta de autenticação por passkey
   * (`verifyAuthenticationResponse`) contra o `expectedChallenge` guardado. Em
   * caso de sucesso atualiza o signature counter armazenado. Retorna true se válido.
   */
  verifyPasskeyAuthentication(
    accountId: string,
    response: unknown,
    expectedChallenge: string
  ): Promise<boolean>
  /** Lista as passkeys da conta (sem expor chave pública / counter). */
  listPasskeys(accountId: string): Promise<PasskeySummary[]>
  /** Remove uma passkey (por credential id) da conta. */
  removePasskey(accountId: string, credentialId: string): Promise<void>
}

/**
 * Verificação de e-mail como ESTADO consultável da conta. CAPACIDADE opcional:
 * stores sem a noção de "e-mail verificado" (ex.: model sem a coluna
 * `email_verified_at`) NÃO expõem o método — e features que dependem dela
 * (`requireVerifiedEmail`) degradam graciosamente (não bloqueiam ninguém) e o
 * doctor avisa. Distinta de {@link CoreAccountStore.consumeEmailVerificationToken},
 * que ESCREVE o estado; aqui só LEMOS.
 */
export interface EmailVerificationStatusCapability {
  /** True se o e-mail da conta está verificado. False se a conta não existe. */
  isEmailVerified(accountId: string): Promise<boolean>
}

/**
 * Deleção self-service / por admin da conta (LGPD/GDPR — "direito ao
 * esquecimento"). CAPACIDADE opcional: stores sem suporte a delete NÃO expõem o
 * método — a UI esconde a "danger zone" e o admin/REST respondem 409. Apenas
 * apaga a LINHA da conta; o cascade dos demais artefatos (sessões, grants, PATs,
 * passkeys, identidades, MFA, avatar) e a anonimização do audit ficam a cargo do
 * `accountDeletionService` (orquestrador no host).
 */
export interface AccountDeletionCapability {
  /** Apaga a linha da conta. Retorna false se a conta não existe. */
  deleteAccount(accountId: string): Promise<boolean>
}

/**
 * Login sem senha por "magic link" — um token de uso único e curta duração
 * enviado por e-mail. CAPACIDADE opcional: stores sem suporte omitem os métodos e
 * a UI esconde o botão "me envie um link".
 *
 * O store default (Lucid) reaproveita as colunas de reset de senha
 * (`passwordResetToken` / `passwordResetExpiresAt`) codificando o token com o
 * prefixo `ml:` — assim NÃO exige migração nova (mesmo padrão do `ec:` da troca de
 * e-mail). O tradeoff é que um magic link e um reset de senha pendentes não
 * coexistem (mesma coluna); na prática são fluxos distintos no tempo. Consumir um
 * magic link NÃO altera a senha.
 */
export interface MagicLinkCapability {
  /**
   * Emite um magic link para o e-mail. Retorna o token + a conta, ou null se a
   * conta não existe (o controller SEMPRE renderiza "link enviado" para não vazar
   * a existência de contas).
   */
  issueMagicLinkToken(email: string): Promise<{ token: string; account: AuthAccount } | null>
  /**
   * Consome (single-use) um magic link. Retorna a conta autenticada ou null se o
   * token é inválido/expirado. NÃO altera a senha.
   */
  consumeMagicLinkToken(token: string): Promise<AuthAccount | null>
}

/**
 * Store de contas usado pela config. É o núcleo SEMPRE presente
 * ({@link CoreAccountStore}) + as capacidades opcionais (MFA, WebAuthn, account
 * linking por provider) marcadas como `Partial` — assim configs/hosts existentes
 * (que referenciam `AccountStore`) compilam sem mudança, e stores que NÃO
 * implementam uma capacidade simplesmente omitem os métodos (em vez de tê-los
 * presentes-mas-lançando). Use os type guards {@link supportsMfa},
 * {@link supportsPasskeys}, {@link supportsProviderIdentity} para estreitar.
 */
export type AccountStore = CoreAccountStore &
  Partial<
    MfaCapability &
      WebauthnCapability &
      ProviderIdentityCapability &
      AccountSecurityCapability &
      AccountStatusCapability &
      ProfileCapability &
      MagicLinkCapability &
      EmailVerificationStatusCapability &
      AccountDeletionCapability
  >

/** Type guard: o store implementa a capacidade de MFA / TOTP. */
export function supportsMfa(store: AccountStore): store is AccountStore & MfaCapability {
  return typeof store.getMfaState === 'function'
}

/** Type guard: o store implementa a capacidade de passkeys / WebAuthn. */
export function supportsPasskeys(store: AccountStore): store is AccountStore & WebauthnCapability {
  return typeof store.listPasskeys === 'function'
}

/** Type guard: o store implementa account linking por identidade de provider. */
export function supportsProviderIdentity(
  store: AccountStore
): store is AccountStore & ProviderIdentityCapability {
  return typeof store.findByProviderIdentity === 'function'
}

/** Type guard: o store implementa o self-service de segurança (senha/e-mail). */
export function supportsAccountSecurity(
  store: AccountStore
): store is AccountStore & AccountSecurityCapability {
  return typeof store.changePassword === 'function'
}

/** Type guard: o store implementa habilitar/desabilitar conta. */
export function supportsAccountStatus(
  store: AccountStore
): store is AccountStore & AccountStatusCapability {
  return typeof store.disableAccount === 'function'
}

/** Type guard: o store implementa a edição de perfil (nome/avatar). */
export function supportsProfile(store: AccountStore): store is AccountStore & ProfileCapability {
  return typeof store.updateProfile === 'function'
}

/** Type guard: o store implementa login por magic link (passwordless). */
export function supportsMagicLink(
  store: AccountStore
): store is AccountStore & MagicLinkCapability {
  return typeof store.issueMagicLinkToken === 'function'
}

/** Type guard: o store consegue dizer se o e-mail de uma conta está verificado. */
export function supportsEmailVerificationStatus(
  store: AccountStore
): store is AccountStore & EmailVerificationStatusCapability {
  return typeof store.isEmailVerified === 'function'
}

/** Type guard: o store implementa a deleção (hard delete) da conta. */
export function supportsAccountDeletion(
  store: AccountStore
): store is AccountStore & AccountDeletionCapability {
  return typeof store.deleteAccount === 'function'
}
