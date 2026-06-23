import { AUTHKIT_METRICS, type MetricsRecorder } from '@adonis-agora/authkit-core'

/**
 * Liga eventos do oidc-provider aos counters do recorder. Usa só eventos reais
 * do v9 (verificados em node_modules/oidc-provider/lib):
 * - `grant.success`        (actions/token.js)              -> loginSuccess
 * - `server_error`         (shared/error_handler.js)        -> loginFailure
 * - `access_token.saved`   (models/base_model.js: <kind>.saved)   -> tokenIssued
 * - `access_token.issued`  (models/base_model.js: <kind>.issued)  -> tokenIssued
 * - `refresh_token.saved`  (models/base_model.js: <kind>.saved)   -> refreshRotated
 * - `grant.revoked`        (helpers/revoke.js)              -> grantRevoked
 */
export function wireProviderEvents(provider: any, recorder: MetricsRecorder): void {
  provider.on('grant.success', () => recorder.increment(AUTHKIT_METRICS.loginSuccess))
  provider.on('server_error', () => recorder.increment(AUTHKIT_METRICS.loginFailure))
  provider.on('access_token.saved', () => recorder.increment(AUTHKIT_METRICS.tokenIssued))
  provider.on('access_token.issued', () => recorder.increment(AUTHKIT_METRICS.tokenIssued))
  provider.on('refresh_token.saved', () => recorder.increment(AUTHKIT_METRICS.refreshRotated))
  provider.on('grant.revoked', () => recorder.increment(AUTHKIT_METRICS.grantRevoked))
}
