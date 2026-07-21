import { AUTHKIT_METRICS, type MetricsRecorder } from '@adonis-agora/authkit-core';
import { emitDiagnostic } from './diagnostics_bridge.js';

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
  provider.on('grant.success', () => recorder.increment(AUTHKIT_METRICS.loginSuccess));
  provider.on('server_error', () => recorder.increment(AUTHKIT_METRICS.loginFailure));
  provider.on('access_token.saved', () => {
    recorder.increment(AUTHKIT_METRICS.tokenIssued);
    // Emit estrutural irmão (best-effort, no-op sem o slot de diagnostics).
    emitDiagnostic('token.issued', { kind: 'access_token' });
  });
  provider.on('access_token.issued', () => {
    recorder.increment(AUTHKIT_METRICS.tokenIssued);
    emitDiagnostic('token.issued', { kind: 'access_token' });
  });
  provider.on('refresh_token.saved', () => {
    recorder.increment(AUTHKIT_METRICS.refreshRotated);
    emitDiagnostic('token.refreshed', { kind: 'refresh_token' });
  });
  provider.on('grant.revoked', () => recorder.increment(AUTHKIT_METRICS.grantRevoked));
}
