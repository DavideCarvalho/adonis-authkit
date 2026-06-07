export { ensureAuthkitSchema } from './src/schema/ensure.js'
export type { EnsureSchemaOptions, EnsureSchemaReport } from './src/schema/ensure.js'
export { defineConfig, adapters, toSeconds } from './src/define_config.js'
export { generatePatToken, hashPatToken } from './src/pat/pat_tokens.js'
export { withAuthUser } from './src/mixins/with_auth_user.js'
export { withCredentials } from './src/mixins/with_credentials.js'
export { withMfa } from './src/mixins/with_mfa.js'
export { OidcService } from './src/provider/oidc_service.js'
export { registerOidcRoutes } from './src/register_routes.js'
export type {
  AuthServerConfigInput,
  ResolvedServerConfig,
  DynamicRegistrationConfigInput,
  ResolvedDynamicRegistrationConfig,
  AdminConfigInput,
  ResolvedAdminConfig,
  AdminApiConfigInput,
  ResolvedAdminApiConfig,
} from './src/define_config.js'
export { resolveAdmin, resolveAdminApi, resolveWebauthn, resolveDynamicRegistration } from './src/define_config.js'
export type { WebauthnConfigInput, ResolvedWebauthnConfig } from './src/define_config.js'
export { resolvePasswordless, resolveLogin } from './src/define_config.js'
export type {
  PasswordlessConfigInput,
  ResolvedPasswordlessConfig,
  LoginConfigInput,
  ResolvedLoginConfig,
} from './src/define_config.js'
export {
  resolveTrustedDevices,
  isTrustedDeviceValid,
  buildTrustedDevicePayload,
  TRUSTED_DEVICE_COOKIE,
} from './src/host/trusted_device.js'
export type {
  TrustedDevicesConfigInput,
  ResolvedTrustedDevicesConfig,
  TrustedDevicePayload,
} from './src/host/trusted_device.js'
export {
  resolveBotProtection,
  botProtectionApplies,
  extractBotToken,
  verifyBotProtection,
  guardBotProtection,
  DEFAULT_BOT_TOKEN_FIELDS,
} from './src/host/bot_protection.js'
export type {
  BotProtectionConfigInput,
  ResolvedBotProtectionConfig,
  BotProtectionVerifyInput,
  BotProtectionWidget,
  BotProtectionAction,
} from './src/host/bot_protection.js'
export { lucidAccountStore } from './src/accounts/lucid_account_store.js'
export type {
  LucidAccountStoreOptions,
  AccountSecretEncrypter,
} from './src/accounts/lucid_account_store.js'
export type {
  AccountStore,
  CoreAccountStore,
  AdminCapability,
  MfaCapability,
  WebauthnCapability,
  ProviderIdentityCapability,
  ProviderIdentitySummary,
  AccountSecurityCapability,
  AccountStatusCapability,
  ProfileCapability,
  MagicLinkCapability,
  EmailVerificationStatusCapability,
  AccountDeletionCapability,
  AccountImportCapability,
  ImportAccountInput,
  AuthAccount,
  CreateAccountInput,
  LinkProviderIdentityInput,
  ListAccountsParams,
  Paginated,
  PasskeySummary,
} from './src/accounts/account_store.js'
export {
  supportsMfa,
  supportsPasskeys,
  supportsProviderIdentity,
  supportsAccountSecurity,
  supportsAccountStatus,
  supportsProfile,
  supportsMagicLink,
  supportsEmailVerificationStatus,
  supportsAccountDeletion,
  supportsAccountImport,
} from './src/accounts/account_store.js'
// Gerência de senha: lazy rehash + legacy verifier, política e checagem de vazamento.
export {
  PasswordManager,
  PasswordPolicyError,
} from './src/password/password_manager.js'
export type {
  PasswordConfigInput,
  LegacyPasswordVerifier,
  PasswordVerifyResult,
} from './src/password/password_manager.js'
export {
  checkPasswordPolicy,
  policyViolationParams,
  DEFAULT_PWNED_TIMEOUT_MS,
} from './src/password/policy.js'
export type {
  ResolvedPasswordPolicy,
  ResolvedPasswordConfig,
  PasswordPolicyViolation,
} from './src/password/policy.js'
export { isPasswordPwned, __setFetchForTests as __setPwnedFetchForTests } from './src/password/pwned.js'
export type { PwnedLogger, FetchLike as PwnedFetchLike } from './src/password/pwned.js'
export { withProviderIdentity } from './src/mixins/with_provider_identity.js'
export type {
  ProviderIdentityRow,
  ProviderIdentityClass,
} from './src/mixins/with_provider_identity.js'
export { withWebauthnCredential } from './src/mixins/with_webauthn_credential.js'
export type {
  WebauthnCredentialRow,
  WebauthnCredentialClass,
} from './src/mixins/with_webauthn_credential.js'
export { lucidPatStore } from './src/pat/lucid_pat_store.js'
export type { PatStore, PatRecord, IssuePatInput } from './src/pat/pat_store.js'
export { withPersonalAccessToken } from './src/mixins/with_personal_access_token.js'
export { lucidAuditSink } from './src/audit/lucid_audit_sink.js'
export type {
  AuditSink,
  AuditEvent,
  AuditEventType,
  StoredAuditEvent,
  ListAuditParams,
  AuditPage,
} from './src/audit/audit_sink.js'
export { withAuditLog } from './src/mixins/with_audit_log.js'
export {
  composeAuditSink,
  resolveEvents,
  buildWebhookBody,
  signWebhookBody,
} from './src/events/dispatcher.js'
export type { EventsConfigInput, ResolvedEventsConfig } from './src/events/dispatcher.js'
export { inertiaRenderer } from './src/host/renderers/inertia_renderer.js'
export type { AuthkitScreen } from './src/host/renderers/inertia_renderer.js'
export type { InertiaRendererOptions } from './src/host/renderers/inertia_renderer.js'
export { edgeRenderer } from './src/host/renderers/edge_renderer.js'
export { brandFor, isFirstParty } from './src/host/branding.js'
export type { BrandingConfig, ClientBrand } from './src/host/branding.js'
export {
  resolveMessages,
  translate,
  DEFAULT_MESSAGES,
  PT_BR_MESSAGES,
  BUILTIN_MESSAGES,
  DEFAULT_LOCALE,
} from './src/host/i18n.js'
export type { I18nConfig, AuthMessages } from './src/host/i18n.js'
export type { AuthHostRenderer, AuthSocialConfig } from './src/define_config.js'
export { registerAuthHost } from './src/host/register_auth_host.js'
export type { AuthHostOptions } from './src/host/register_auth_host.js'
export {
  getAdminPrefix,
  setAdminPrefix,
  normalizeAdminPrefix,
  getAdminApiPrefix,
  setAdminApiPrefix,
  normalizeAdminApiPrefix,
} from './src/host/admin_prefix.js'
export { resolveRateLimit, resolveNotifications } from './src/define_config.js'
export type {
  ResolvedNotificationsConfig,
} from './src/define_config.js'
export type {
  RateLimitConfigInput,
  RateLimitBucket,
  ResolvedRateLimitConfig,
} from './src/define_config.js'
export { createAuthThrottles } from './src/host/rate_limit.js'
export type { AuthThrottles, ThrottleMiddleware } from './src/host/rate_limit.js'

/**
 * Admin services compartilhados pelo console (B6/HTML), pela Admin REST API (R6)
 * e pelo driver `embedded` do @dudousxd/adonis-authkit-sdk (in-process).
 */
export { AdminUsersService } from './src/host/admin_api/admin_users_service.js'
export { AdminOrgsService } from './src/host/admin_api/admin_orgs_service.js'
export type {
  OrgWithMemberCount,
  OrgDetail,
  CreateOrgInput as AdminCreateOrgInput,
  UpdateOrgInput as AdminUpdateOrgInput,
  AddMemberInput as AdminAddMemberInput,
  CreateInvitationInput as AdminCreateInvitationInput,
} from './src/host/admin_api/admin_orgs_service.js'
export type {
  AdminActor,
  CreateUserInput as AdminCreateUserInput,
  CreateUserResult as AdminCreateUserResult,
  DeleteUserResult as AdminDeleteUserResult,
} from './src/host/admin_api/admin_users_service.js'
export { AccountDeletionService } from './src/host/account_deletion_service.js'
export type {
  DeletionActor,
  DeletionResult,
} from './src/host/account_deletion_service.js'
export { AccountExportService } from './src/host/account_export_service.js'
export type { AccountExport } from './src/host/account_export_service.js'
export { AdminClientsService } from './src/host/admin_clients_service.js'
export type {
  AdminClient,
  ClientInput as AdminClientInput,
  CreatedClient,
  TokenEndpointAuthMethod,
} from './src/host/admin_clients_service.js'
export { AdminSessionsService } from './src/host/admin_sessions_service.js'
export type {
  AdminSession,
  AdminGrant,
  RevokeResult,
} from './src/host/admin_sessions_service.js'
export { TokenVerifyService } from './src/host/admin_api/token_verify_service.js'
export type { VerifyResult } from './src/host/admin_api/token_verify_service.js'

// Contexto de sessão (user-agent/geo) + métricas do dashboard.
export { enrichSessionsWithContext } from './src/host/session_context.js'
export { parseUserAgent } from './src/host/user_agent.js'
export type { ParsedUserAgent } from './src/host/user_agent.js'
export { resolveGeoSafe, GEO_RESOLVE_TIMEOUT_MS } from './src/host/geo.js'
export type { ResolveGeo } from './src/host/geo.js'
export { computeAdminStats } from './src/host/admin_stats_service.js'
export type { AdminStats, DailyPoint } from './src/host/admin_stats_service.js'
export { barChartSvg } from './src/host/svg_chart.js'
export { buildImpersonationPanel } from './src/host/impersonation.js'
export type { ImpersonationPanel } from './src/host/impersonation.js'

// Organizations (multi-tenancy)
export {
  ACTIVE_ORG_COOKIE,
  ACTIVE_ORG_COOKIE_TTL,
  encodeActiveOrgCookie,
  decodeActiveOrgCookie,
  readActiveOrgFromKoaCtx,
} from './src/host/active_org_cookie.js'
export { resolveOrganizations } from './src/define_config.js'
export type {
  OrganizationsConfigInput,
  ResolvedOrganizationsConfig,
} from './src/define_config.js'
export { supportsOrganizations } from './src/accounts/account_store.js'
export type {
  OrganizationsCapability,
  OrgSummary,
  OrgMember,
  OrgInvitation,
  ActiveOrgInfo,
} from './src/accounts/account_store.js'

/**
 * Configure hook + stubsRoot resolvidos pelo `node ace configure @dudousxd/adonis-authkit-server`.
 * O comando do AdonisJS importa o entrypoint principal e procura por estes exports.
 */
export { configure } from './commands/configure.js'
export { stubsRoot } from './stubs/main.js'

// Runtime settings (capability-probed, optional table `auth_settings`).
export { RuntimeSettings, supportsSettings } from './src/host/runtime_settings.js'
export type { SettingsCapability, SettingRow, RuntimeSettingsOptions } from './src/host/runtime_settings.js'
export {
  resolveEffectiveBotProtection,
} from './src/host/bot_protection.js'
export type { BotProtectionSetting } from './src/host/bot_protection.js'

// Runtime toggles (registration, require_verified_email, maintenance_mode).
export {
  SETTING_KEYS,
  resolveEffectiveRegistration,
  resolveEffectiveRequireVerifiedEmail,
  resolveEffectiveMaintenanceMode,
} from './src/host/runtime_toggles.js'
export type {
  SettingKey,
  RegistrationSetting,
  RequireVerifiedEmailSetting,
  MaintenanceModeSetting,
  ResolvedMaintenanceMode,
} from './src/host/runtime_toggles.js'
export { resolveRegistration } from './src/define_config.js'
export type {
  RegistrationConfigInput,
  ResolvedRegistrationConfig,
} from './src/define_config.js'

export {
  getAccountId,
  hasAccountSession,
  consoleLoginUrl,
} from './src/host/console_session.js'
export { ACCOUNT_SESSION_KEY } from './src/host/middleware/account_auth.js'
