/**
 * The optional `@adonis-agora/telescope` integration for authkit, isolated to this
 * subpath (`@adonis-agora/authkit-server/telescope`) so the main barrel never
 * pulls in telescope. Import it ONLY from `config/telescope.ts`, where both
 * `@adonis-agora/telescope` and `@adonis-agora/authkit-server` are installed.
 */
export {
  defineAuthkitTelescopeExtension,
  type AuthkitTelescopeOptions,
} from "./extension.js";
export {
  authkitDataProviders,
  authkitEventCountProvider,
  authkitLoginSuccessRateProvider,
  authkitLoginsOverTimeProvider,
  authkitEventBreakdownProvider,
  authkitTokenActivityProvider,
} from "./data_providers.js";
