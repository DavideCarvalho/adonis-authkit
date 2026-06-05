export { defineConfig, resolvers } from './src/define_config.js'
export { Authenticator } from './src/authenticator.js'
export { identityToUser, createUserinfoResolver } from './src/user_resolvers.js'
export type {
  ClaimsUser,
  ResolveUserContext,
  UserinfoResolverOptions,
} from './src/user_resolvers.js'
export {
  buildAuthorizeUrl,
  buildEndSessionUrl,
  exchangeCode,
  exchangeToken,
  refreshTokens,
  generatePkce,
} from './src/oidc_login.js'
export type { EndSessionParams, RefreshParams } from './src/oidc_login.js'
export { AuthkitClientManager } from './providers/authkit_client_provider.js'
export type {
  ResolvedClientConfig,
  ClientConfigInput,
  BackchannelLogoutCallback,
} from './src/define_config.js'
export {
  validateLogoutToken,
  InvalidLogoutTokenError,
  InMemorySessionIndex,
  BACKCHANNEL_LOGOUT_EVENT,
} from './src/backchannel_logout.js'
export type {
  ValidateLogoutTokenOptions,
  ValidatedLogoutToken,
  SessionIndex,
  SessionIndexEntry,
} from './src/backchannel_logout.js'
export {
  generateDpopKeyPair,
  createDpopProof,
  dpopJwkThumbprint,
} from './src/dpop.js'
export type { DpopKeyPair, CreateDpopProofInput } from './src/dpop.js'
export {
  verifyJwtAccessToken,
  clearJwksCache,
} from './src/verify_access_token.js'
export type {
  VerifyJwtAccessTokenOptions,
  JwtAccessTokenClaims,
} from './src/verify_access_token.js'
export type { TokenSet } from './src/types.js'
export type { Identity } from '@dudousxd/adonis-authkit-core'
export { configure } from './commands/configure.js'
