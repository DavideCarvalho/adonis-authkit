/**
 * DTO público da conta (espelha `AuthAccount` do server). Mantido local para o
 * pacote de testing não depender do server em runtime (que arrasta Lucid etc.).
 */
export interface FakeAuthAccount {
  id: string;
  email: string;
  globalRoles?: string[];
  name?: string;
  avatarUrl?: string;
}

export interface FakeAccountStoreOptions {
  /** conta fixa retornada por findById/verifyCredentials/findByEmail. */
  account?: FakeAuthAccount;
  /** inclui métodos da capacidade MfaCapability (supportsMfa → true). */
  withMfa?: boolean;
  /** inclui métodos da capacidade WebauthnCapability (supportsPasskeys → true). */
  withPasskeys?: boolean;
  /** inclui métodos da capacidade AccountSecurityCapability (supportsAccountSecurity → true). */
  withAccountSecurity?: boolean;
  /** sobrescreve qualquer método individualmente. */
  overrides?: Record<string, unknown>;
}

/**
 * AccountStore mínimo para testes de host, capability-aware. O núcleo
 * (findById/verifyCredentials/create/...) e a capacidade de provider-identity e
 * admin sempre estão presentes; MFA, passkeys e account-security são opt-in via
 * flags para exercitar os type guards `supports*` do server.
 */
export function fakeAccountStore(options: FakeAccountStoreOptions = {}): Record<string, unknown> {
  const fixed: FakeAuthAccount = options.account ?? {
    id: 'u1',
    email: 'a@b.com',
    globalRoles: ['ADMIN'],
  };

  const core: Record<string, unknown> = {
    findById: async (id: string) => ({ ...fixed, id }),
    verifyCredentials: async (email: string) => (email === fixed.email ? { ...fixed } : null),
    findByEmail: async (email: string) => (email === fixed.email ? { ...fixed } : null),
    create: async (input: { email: string; globalRoles?: string[] }) => ({
      id: 'new',
      email: input.email,
      globalRoles: input.globalRoles ?? [],
    }),
    findByProviderIdentity: async () => null,
    linkProviderIdentity: async () => {},
    issuePasswordResetToken: async () => null,
    consumePasswordResetToken: async () => false,
    issueEmailVerificationToken: async () => null,
    consumeEmailVerificationToken: async () => false,
    listAccounts: async () => ({ data: [{ ...fixed }], total: 1 }),
    setGlobalRoles: async () => {},
  };

  if (options.withMfa) {
    core.getMfaState = async () => ({ enabled: false });
    core.enableMfa = async () => {};
    core.disableMfa = async () => {};
  }

  if (options.withPasskeys) {
    core.listPasskeys = async () => [];
    core.registerPasskey = async () => {};
    core.deletePasskey = async () => {};
  }

  if (options.withAccountSecurity) {
    core.changePassword = async () => true;
    core.requestEmailChange = async () => null;
    core.confirmEmailChange = async () => ({ ok: false });
  }

  return { ...core, ...(options.overrides ?? {}) };
}
