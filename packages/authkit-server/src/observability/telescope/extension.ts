import type {
  DashboardSpec,
  ExtensionEntryType,
  TelescopeExtension,
} from '@adonis-agora/telescope';
import { authkitDataProviders } from './data_providers.js';

/** Options for {@link defineAuthkitTelescopeExtension}. */
export interface AuthkitTelescopeOptions {
  /**
   * Rolling window (ms) the "Security" stat/gauge/breakdown panels aggregate
   * over. Default 24h.
   */
  windowMs?: number;
}

/**
 * The navigable entry type the extension contributes: it scopes Telescope's
 * entry-type nav to authkit's audit events (recorded as `diagnostic` entries
 * tagged `lib:authkit`).
 */
function authkitEntryType(): ExtensionEntryType {
  return { id: 'authkit', label: 'Auth', dot: 'bg-emerald-400' };
}

/**
 * The authkit "Security" dashboard — a golden-signals layout for auth: login
 * health up top, then what-needs-attention (lockouts, failed logins, PAT /
 * impersonation activity), then trends. Pure data: panels bind to the
 * `authkit.*` data providers by name.
 */
function authkitSecurityDashboard(opts: AuthkitTelescopeOptions): DashboardSpec {
  const windowMs = opts.windowMs ?? 24 * 60 * 60 * 1000;
  return {
    id: 'authkit.security',
    label: 'Security',
    navGroup: 'Auth',
    panels: [],
    sections: [
      {
        title: 'Logins',
        cols: 4,
        panels: [
          {
            kind: 'gauge',
            title: 'Login success rate',
            data: { provider: 'authkit.loginSuccessRate', query: { windowMs } },
            max: 1,
            format: 'percent',
            thresholds: { warn: 0.9, bad: 0.75, direction: 'down-bad' },
          },
          {
            kind: 'stat',
            title: 'Successful logins',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'loginSuccess', windowMs },
            },
            spark: true,
          },
          {
            kind: 'stat',
            title: 'Failed logins',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'loginFailure', windowMs },
            },
            spark: true,
            thresholds: { warn: 25, bad: 100, direction: 'up-bad' },
          },
          {
            kind: 'stat',
            title: 'Account lockouts',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'lockouts', windowMs },
            },
            spark: true,
            thresholds: { warn: 5, bad: 25, direction: 'up-bad' },
          },
        ],
      },
      {
        title: 'MFA & tokens',
        cols: 3,
        panels: [
          {
            kind: 'stat',
            title: 'MFA / passkey enrollments',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'mfaEnrollments', windowMs },
            },
            spark: true,
          },
          {
            kind: 'stat',
            title: 'Impersonation events',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'impersonation', windowMs },
            },
            spark: true,
            thresholds: { warn: 1, bad: 10, direction: 'up-bad' },
          },
          {
            kind: 'stat',
            title: 'PAT activity',
            data: {
              provider: 'authkit.eventCount',
              query: { metric: 'pat', windowMs },
            },
            spark: true,
          },
        ],
      },
      {
        title: 'Trends',
        cols: 2,
        panels: [
          {
            kind: 'timeseries',
            title: 'Logins over time',
            data: { provider: 'authkit.loginsOverTime' },
            series: ['success', 'failure'],
            style: 'stacked',
          },
          {
            kind: 'breakdown',
            title: 'Events by family',
            data: { provider: 'authkit.eventBreakdown', query: { windowMs } },
            style: 'donut',
          },
        ],
      },
      {
        title: 'PAT & impersonation activity',
        cols: 2,
        panels: [
          {
            kind: 'table',
            title: 'Recent token & impersonation events',
            data: { provider: 'authkit.tokenActivity' },
            // No "IP" column: the diagnostics bridge emits a PII-free projection
            // (no `email`/`ip`/`metadata`), so a deleted account's PII never lands
            // in Telescope's store. See `redactAuditEventForDiagnostics`.
            columns: [
              { key: 'at', label: 'When' },
              { key: 'event', label: 'Event' },
              { key: 'subject', label: 'Subject' },
              { key: 'actor', label: 'Actor' },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * The first-class `@adonis-agora/telescope` extension for `@adonis-agora/authkit-server`:
 * a "Security" auth dashboard (login health, MFA, lockouts, PAT / impersonation)
 * plus the data providers it binds to. Wire it into `config/telescope.ts`:
 *
 * ```ts
 * import { defineConfig } from "@adonis-agora/telescope"
 * import { defineAuthkitTelescopeExtension } from "@adonis-agora/authkit-server/telescope"
 *
 * export default defineConfig({ extensions: [defineAuthkitTelescopeExtension()] })
 * ```
 *
 * No watcher is contributed — the authkit provider already bridges every audit
 * event onto the diagnostics bus (`agora:authkit:<AuditEventType>`), and
 * Telescope's generic diagnostics watcher records them as `diagnostic` entries
 * tagged `lib:authkit`. The providers aggregate those captured entries; the
 * baseline (events on the bus) works without this extension — registering it
 * just adds the dedicated dashboard.
 */
export function defineAuthkitTelescopeExtension(
  opts: AuthkitTelescopeOptions = {},
): TelescopeExtension {
  return {
    name: 'authkit',
    entryTypes: () => [authkitEntryType()],
    dashboards: () => [authkitSecurityDashboard(opts)],
    dataProviders: () => authkitDataProviders(),
  };
}
