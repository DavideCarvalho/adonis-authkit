// Estado de auth (shared-prop do Inertia)
export { useAuth } from './src/use_auth.js'
export { AuthProvider, AuthContext } from './src/provider.js'
export type { AuthProviderProps } from './src/provider.js'

// Provider de config + headless hooks de URL/dados
export { AuthkitProvider } from './src/authkit_provider.js'
export type { AuthkitProviderProps } from './src/authkit_provider.js'
export {
  AuthkitConfigContext,
  useAuthkitConfig,
  resolveConfig,
  buildAuthUrl,
  DEFAULT_CONFIG,
} from './src/config.js'
export type {
  AuthkitConfig,
  ResolvedAuthkitConfig,
  AuthkitEndpoints,
} from './src/config.js'

export { useSignIn } from './src/hooks/use_sign_in.js'
export type { SignInOptions } from './src/hooks/use_sign_in.js'
export { useSignOut } from './src/hooks/use_sign_out.js'
export type { SignOutOptions } from './src/hooks/use_sign_out.js'
export { useUser } from './src/hooks/use_user.js'
export type { UseUserResult } from './src/hooks/use_user.js'
export { useProfile } from './src/hooks/use_profile.js'
export type { UseProfileResult, ProfileUpdate } from './src/hooks/use_profile.js'
export { useSessions } from './src/hooks/use_sessions.js'
export type { UseSessionsResult, AuthSession } from './src/hooks/use_sessions.js'
export { useAuthorizedApps } from './src/hooks/use_authorized_apps.js'
export type { UseAuthorizedAppsResult, AuthorizedApp } from './src/hooks/use_authorized_apps.js'
export { useOrganizations } from './src/hooks/use_organizations.js'
export type { UseOrganizationsResult, OrgEntry } from './src/hooks/use_organizations.js'
export { useOrganization } from './src/hooks/use_organization.js'
export type { UseOrganizationResult, ActiveOrgDetail, OrgMemberEntry } from './src/hooks/use_organization.js'
export { useSwitchOrganization } from './src/hooks/use_switch_organization.js'
export type { UseSwitchOrganizationResult } from './src/hooks/use_switch_organization.js'
export { useOrgInvitations } from './src/hooks/use_org_invitations.js'
export type { UseOrgInvitationsResult, OrgInvitationEntry } from './src/hooks/use_org_invitations.js'
export { jsonRequest, useResource } from './src/hooks/use_resource.js'
export type { ResourceState } from './src/hooks/use_resource.js'
export {
  usePasswordStrength,
  heuristicScorer,
} from './src/hooks/use_password_strength.js'
export type {
  PasswordStrengthScore,
  PasswordStrengthResult,
  PasswordScorer,
  UsePasswordStrengthOptions,
} from './src/hooks/use_password_strength.js'

// utilitários puros
export { deriveInitials, currentUrl } from './src/utils.js'

// Componentes de gating
export { Authenticated, Guest } from './src/components/authenticated.js'
export type { AuthenticatedProps, GuestProps } from './src/components/authenticated.js'
export { Can } from './src/components/can.js'
export type { CanProps } from './src/components/can.js'

// Componentes prontos
export { SignInButton } from './src/components/sign_in_button.js'
export type { SignInButtonProps } from './src/components/sign_in_button.js'
export { SignOutButton } from './src/components/sign_out_button.js'
export type { SignOutButtonProps } from './src/components/sign_out_button.js'
export { Avatar } from './src/components/avatar.js'
export type { AvatarProps } from './src/components/avatar.js'
export { UserButton } from './src/components/user_button.js'
export type { UserButtonProps } from './src/components/user_button.js'
export { UserProfile } from './src/components/user_profile.js'
export type { UserProfileProps } from './src/components/user_profile.js'
export { AuthorizedApps } from './src/components/authorized_apps.js'
export type { AuthorizedAppsProps } from './src/components/authorized_apps.js'
export { PasswordStrengthMeter } from './src/components/password_strength_meter.js'
export type { PasswordStrengthMeterProps } from './src/components/password_strength_meter.js'
export { OrganizationSwitcher } from './src/components/organization_switcher.js'
export type { OrganizationSwitcherProps } from './src/components/organization_switcher.js'
export { OrganizationProfile } from './src/components/organization_profile.js'
export type { OrganizationProfileProps } from './src/components/organization_profile.js'

// helpers de papéis (puros)
export {
  hasGlobalRole,
  hasAnyGlobalRole,
  hasAllGlobalRoles,
  hasAppRole,
  hasAnyAppRole,
  hasAllAppRoles,
} from './src/roles.js'
export type { AuthUser, AuthSharedProps, AuthState } from './src/types.js'
