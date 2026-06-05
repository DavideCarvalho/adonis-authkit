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
} from './src/define_config.js'
export { resolveAdmin, resolveWebauthn, resolveDynamicRegistration } from './src/define_config.js'
export type { WebauthnConfigInput, ResolvedWebauthnConfig } from './src/define_config.js'
export { resolvePasswordless } from './src/define_config.js'
export type {
  PasswordlessConfigInput,
  ResolvedPasswordlessConfig,
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
  AccountSecurityCapability,
  MagicLinkCapability,
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
  supportsMagicLink,
} from './src/accounts/account_store.js'
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
export { resolveRateLimit, resolveNotifications } from './src/define_config.js'
export type {
  NotificationsConfigInput,
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
 * Configure hook + stubsRoot resolvidos pelo `node ace configure @dudousxd/adonis-authkit-server`.
 * O comando do AdonisJS importa o entrypoint principal e procura por estes exports.
 */
export { configure } from './commands/configure.js'
export { stubsRoot } from './stubs/main.js'
