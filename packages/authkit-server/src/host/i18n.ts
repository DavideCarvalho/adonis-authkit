/**
 * Internacionalização (i18n) das telas do host-kit.
 *
 * Todas as strings visíveis ao usuário das views Edge (e as mensagens de
 * flash/erro produzidas pelos controllers) vivem num catálogo achatado de
 * chaves pontilhadas. O default embutido é inglês (`en`) — os apps continuam
 * funcionando SEM nenhuma configuração. O pt-BR é um locale embutido: basta
 * `i18n: { locale: 'pt-BR' }`. O host também pode sobrescrever chaves pontuais
 * ou fornecer locales inteiros (ex.: `fr`) via `I18nConfig`.
 */

/** Catálogo achatado de chaves de mensagem → strings. */
export type AuthMessages = Record<string, string>

export interface I18nConfig {
  /** Locale ativo. Default: 'en'. Locale embutido extra: 'pt-BR'. */
  locale?: string
  /**
   * Locales adicionais e/ou overrides pontuais. As chaves do locale ativo são
   * mescladas SOBRE o catálogo embutido do locale (ou sobre o default `en`
   * quando o locale não é embutido) — então o host pode trocar só algumas
   * chaves, complementar um locale embutido, ou trazer um locale novo por
   * completo.
   */
  messages?: Record<string, Partial<AuthMessages>>
}

/** Locale default do host-kit. */
export const DEFAULT_LOCALE = 'en'

/**
 * Catálogo default (inglês) — cobre TODAS as strings visíveis ao usuário das
 * views e as mensagens de flash/erro dos controllers. Chaves agrupadas por tela.
 */
export const DEFAULT_MESSAGES = {
  // Comum / fallback de marca.
  'common.app_fallback': 'Auth',
  'common.brand_eyebrow': 'Auth',

  // Tela de login (interaction OIDC: identifier + password).
  'login.page_title': 'Login',
  'login.title': 'Login',
  'login.identifier_intro': 'Enter your email to continue.',
  'login.email_label': 'Email',
  'login.identifier_submit': 'Continue',
  'login.create_account': 'Create account',
  'login.forgot_password': 'Forgot password',
  'login.divider_or': 'or',
  'login.google': 'Sign in with Google',
  'login.greeting': 'Hi, {name}',
  'login.switch_account': 'Switch account',
  'login.password_label': 'Password',
  'login.submit': 'Log in',
  // Passwordless (login).
  'login.magic_link_button': 'Email me a login link',
  'login.magic_link_sent': 'If the account exists, we sent you a login link.',
  'login.passkey_button': 'Sign in with a passkey',

  // Tela de cadastro (signup).
  'signup.page_title': 'Create account',
  'signup.title': 'Create account',
  'signup.intro': 'Fill in your details to get started.',
  'signup.name_label': 'Name',
  'signup.email_label': 'Email',
  'signup.password_label': 'Password',
  'signup.submit': 'Create account',
  'signup.have_account': 'I already have an account',

  // Recuperação de senha (forgot).
  'forgot.page_title': 'Reset password',
  'forgot.sent_title': 'Email sent',
  'forgot.sent_body': 'If the email exists, we will send reset instructions.',
  'forgot.title': 'Reset password',
  'forgot.intro': 'We will send you a link to reset your password.',
  'forgot.email_label': 'Email',
  'forgot.submit': 'Send link',

  // Redefinição de senha (reset).
  'reset.page_title': 'Reset password',
  'reset.done_title': 'Password reset',
  'reset.done_body': 'You can now log in with your new password.',
  'reset.title': 'New password',
  'reset.intro': 'Choose a new password for your account.',
  'reset.password_label': 'Password',
  'reset.submit': 'Reset',

  // Verificação de e-mail (verify-email).
  'verify_email.page_title': 'Verify email',
  'verify_email.verified_title': 'Email verified',
  'verify_email.verified_body': 'Your email was confirmed successfully.',
  'verify_email.invalid_title': 'Invalid link',
  'verify_email.invalid_body': 'The verification link is invalid or has already been used.',

  // Desafio de MFA no fluxo de login (mfa-challenge).
  'mfa_challenge.page_title': 'Two-factor verification',
  'mfa_challenge.title': 'Two-factor verification',
  'mfa_challenge.intro': 'Open your authenticator app and enter the 6-digit code.',
  'mfa_challenge.code_label': 'Code',
  'mfa_challenge.submit': 'Verify',
  'mfa_challenge.recovery_summary': 'Use a recovery code',
  'mfa_challenge.recovery_submit': 'Log in with a recovery code',
  'mfa_challenge.passkey_button': 'Use passkey',
  'mfa_challenge.passkey_error': 'Could not authenticate with the passkey. Please try again.',
  'mfa_challenge.trust_device': 'Trust this device for {days} days',

  // Consent (autorização de cliente OIDC).
  'consent.page_title': 'Authorize',
  'consent.title': 'Authorize access',
  // `{app}` é interpolado com o nome do app já envolto em <strong> (renderizado
  // raw na view). O nome vem do branding (config-trusted).
  'consent.body': 'The app <strong>{app}</strong> wants to access your account.',
  'consent.submit': 'Authorize',

  // Console de conta — login (account/login).
  'account.login.page_title': 'My account',
  'account.login.title': 'My account',
  'account.login.intro': 'Manage your access tokens.',
  'account.login.email_label': 'Email',
  'account.login.password_label': 'Password',
  'account.login.submit': 'Log in',

  // Console de conta — tokens (account/tokens).
  'account.tokens.page_title': 'Access tokens',
  'account.tokens.title': 'Access tokens',
  'account.tokens.logout': 'Log out',
  'account.tokens.security': 'Security',
  'account.tokens.created_notice': 'Token created — copy it now, it will not be shown again:',
  'account.tokens.name_placeholder': 'Token name (e.g. CI deploy)',
  'account.tokens.create': 'Create',
  'account.tokens.empty': 'No tokens yet.',
  'account.tokens.created_at': 'Created on {date}',
  'account.tokens.last_used': '· last used {date}',
  'account.tokens.never_used': '· never used',
  'account.tokens.scopes': 'Scopes: {scopes}',
  'account.tokens.audience': 'Audience: {audience}',
  'account.tokens.revoke': 'Revoke',

  // Console de conta — segurança (account/security): senha + e-mail.
  'account.security.page_title': 'Account security',
  'account.security.title': 'Account security',
  'account.security.logout': 'Log out',
  'account.security.current_email': 'Current email: {email}',
  'account.security.not_supported':
    'Changing password and email is not available in this installation.',
  'account.security.password_section': 'Change password',
  'account.security.current_password_label': 'Current password',
  'account.security.new_password_label': 'New password',
  'account.security.change_password_submit': 'Change password',
  'account.security.password_changed': 'Password changed successfully.',
  'account.security.email_section': 'Change email',
  'account.security.email_intro':
    'We will send a confirmation link to the new address. The change only takes effect after confirmation.',
  'account.security.new_email_label': 'New email',
  'account.security.email_password_label': 'Current password',
  'account.security.change_email_submit': 'Request email change',
  'account.security.email_change_requested':
    'We sent a confirmation link to {email}. Click it to complete the change.',
  'account.security.email_changed': 'Email changed successfully.',
  // Trusted devices (account/security).
  'account.security.trusted_devices_section': 'Trusted devices',
  'account.security.trusted_devices_intro':
    'You can stop trusting this browser so two-factor is required here again. To revoke trust on all devices, re-enroll your authenticator.',
  'account.security.trusted_devices_revoke': 'Stop trusting this device',
  'account.security.trusted_devices_revoked':
    'This device is no longer trusted. Two-factor will be required here again.',
  'account.security.sessions_section': 'Active sessions',
  'account.security.sessions_intro': 'Devices and locations where your account is currently signed in.',
  'account.security.sessions_empty': 'No active sessions.',

  // Console de conta — perfil (seção em account/security).
  'account.profile.section': 'Profile',
  'account.profile.intro': 'Update your display name and avatar.',
  'account.profile.name_label': 'Name',
  'account.profile.avatar_label': 'Avatar URL',
  'account.profile.avatar_upload_label': 'Upload avatar',
  'account.profile.avatar_upload_hint': 'JPG, PNG or WebP, up to 5MB.',
  'account.profile.avatar_invalid_type': 'Invalid image type. Use JPG, PNG or WebP.',
  'account.profile.avatar_too_large': 'Image is too large.',
  'account.profile.submit': 'Save profile',
  'account.profile.updated': 'Profile updated successfully.',
  'account.profile.not_supported': 'Profile editing is not available in this installation.',

  // Console de conta — exportar dados (portabilidade, LGPD/GDPR).
  'account.export.section': 'Export your data',
  'account.export.intro':
    'Download a copy of your data: profile, linked identities, authorized apps, active sessions, passkeys and your audit history. No secrets or tokens are included.',
  'account.export.submit': 'Download my data (JSON)',

  // Console de conta — deletar conta (danger zone, LGPD/GDPR).
  'account.delete.section': 'Delete account',
  'account.delete.intro':
    'Permanently delete your account and all associated data: sessions, authorized apps, personal access tokens, passkeys, linked identities and two-factor secrets. This cannot be undone.',
  'account.delete.confirm_password_label': 'Confirm with your current password',
  'account.delete.confirm_email_label': 'Type your email to confirm',
  'account.delete.submit': 'Delete my account',
  'account.delete.deleted': 'Your account has been permanently deleted.',
  'account.delete.invalid_confirmation': 'Confirmation failed. Your account was not deleted.',
  'account.delete.not_supported': 'Account deletion is not available in this installation.',

  // Console de conta — apps com acesso (account/apps).
  'account.apps.page_title': 'Apps with access',
  'account.apps.title': 'Apps with access',
  'account.apps.intro': 'Apps you have authorized to access your account.',
  'account.apps.logout': 'Log out',
  'account.apps.empty': 'No apps have access to your account.',
  'account.apps.tokens': '{accessTokens} access · {refreshTokens} refresh',
  'account.apps.revoke': 'Revoke access',
  'account.apps.revoke_confirm':
    'Revoke this app’s access? It will need to be authorized again and its tokens will stop working.',
  'account.apps.revoked': 'Access revoked.',
  'account.apps.not_supported':
    'The configured OIDC adapter does not support enumeration — listing apps is unavailable.',

  // Console de conta — organizations (account/orgs).
  'account.orgs.page_title': 'My Organizations',
  'account.orgs.title': 'My Organizations',
  'account.orgs.logout': 'Log out',
  'account.orgs.empty': 'You are not a member of any organization.',
  'account.orgs.active_badge': 'Active',
  'account.orgs.activate': 'Set as active',
  'account.orgs.deactivate': 'Deactivate',
  'account.orgs.leave': 'Leave',
  'account.orgs.leave_last_owner': 'Cannot leave — you are the only owner.',
  'account.orgs.create_section': 'Create organization',
  'account.orgs.create_name_label': 'Name',
  'account.orgs.create_slug_label': 'Slug (URL-friendly identifier)',
  'account.orgs.create_submit': 'Create organization',
  'account.orgs.created': 'Organization created.',
  'account.orgs.activated': 'Organization activated.',
  'account.orgs.deactivated': 'Organization deactivated.',
  'account.orgs.left': 'You left the organization.',
  'account.orgs.not_supported': 'Organizations are not available in this installation.',
  'account.orgs.not_member': 'You are not a member of this organization.',
  // Invitations section
  'account.orgs.invitations_section': 'Pending invitations',
  'account.orgs.invitations_empty': 'No pending invitations.',
  'account.orgs.invitation_from': 'Invited to {orgName} as {role}',
  'account.orgs.invitation_accept': 'Accept',
  'account.orgs.invitation_accepted': 'Invitation accepted.',
  'account.orgs.invitation_error': 'Could not accept invitation.',
  // Members (for owners/admins)
  'account.orgs.members_section': 'Members',
  'account.orgs.invite_section': 'Invite by email',
  'account.orgs.invite_email_label': 'Email',
  'account.orgs.invite_role_label': 'Role',
  'account.orgs.invite_submit': 'Send invitation',
  'account.orgs.invited': 'Invitation sent.',
  'account.orgs.remove_member': 'Remove',
  'account.orgs.member_removed': 'Member removed.',
  'account.orgs.change_role': 'Change role',
  'account.orgs.role_updated': 'Role updated.',

  // Confirmação de troca de e-mail (account/email-confirmed).
  'account.email_confirmed.page_title': 'Email confirmation',
  'account.email_confirmed.ok_title': 'Email changed',
  'account.email_confirmed.ok_body': 'Your new email has been confirmed and is now active.',
  'account.email_confirmed.invalid_title': 'Invalid link',
  'account.email_confirmed.invalid_body':
    'The confirmation link is invalid or has already been used.',

  // Console de conta — MFA (account/mfa).
  'account.mfa.page_title': 'Two-factor verification',
  'account.mfa.title': 'Two-factor verification',
  'account.mfa.logout': 'Log out',
  'account.mfa.recovery_codes_notice':
    'Save your recovery codes — they will not be shown again:',
  'account.mfa.enroll_intro':
    'Scan the QR code with your authenticator app (Google Authenticator, 1Password, etc.).',
  'account.mfa.qr_alt': 'TOTP QR code',
  'account.mfa.manual_intro': 'Or enter it manually:',
  'account.mfa.confirm_code_label': 'Confirmation code',
  'account.mfa.activate': 'Enable two-factor verification',
  'account.mfa.enabled_html':
    'Two-factor verification is <span class="font-semibold text-emerald-700">enabled</span> on this account.',
  'account.mfa.disable': 'Disable',
  'account.mfa.disabled_intro':
    'Two-factor verification is disabled. Enable it to protect your account with an authenticator app.',
  'account.mfa.enable': 'Enable two-factor verification',

  // Console de conta — passkeys (WebAuthn) na tela de MFA.
  'mfa.passkey.section_title': 'Passkeys',
  'mfa.passkey.section_intro':
    'Use a passkey (biometrics, device PIN, or security key) as a second factor, without typing codes.',
  'mfa.passkey.add': 'Add passkey',
  'mfa.passkey.remove': 'Remove',
  'mfa.passkey.empty': 'No passkeys registered.',
  'mfa.passkey.unnamed': 'Passkey',
  'mfa.passkey.created_at': 'Created on {date}',
  'mfa.passkey.register_error': 'Could not register the passkey. Please try again.',
  'mfa.passkey.unsupported': 'Your browser does not support passkeys.',

  // Console admin (B6) — navegação compartilhada.
  'admin.nav.dashboard': 'Dashboard',
  'admin.nav.users': 'Users',
  'admin.nav.orgs': 'Organizations',
  'admin.nav.clients': 'Clients',
  'admin.nav.audit': 'Audit',
  'admin.nav.settings': 'Settings',
  'admin.nav.logout': 'Log out',

  // Console admin — dashboard.
  'admin.dashboard.page_title': 'Admin dashboard',
  'admin.dashboard.title': 'Admin dashboard',
  'admin.dashboard.users_count': 'Users',
  'admin.dashboard.clients_count': 'Clients',
  'admin.dashboard.audit_count': 'Audit events',
  'admin.dashboard.recent_title': 'Recent events',
  'admin.dashboard.mau': 'Active users (30d)',
  'admin.dashboard.active_sessions': 'Active sessions',
  'admin.dashboard.signins_title': 'Sign-ins (last {days}d)',
  'admin.dashboard.signups_title': 'Sign-ups (last {days}d)',

  // Console admin — usuários.
  'admin.users.page_title': 'Users',
  'admin.users.title': 'Users',
  'admin.users.search_placeholder': 'Search by email',
  'admin.users.search': 'Search',
  'admin.users.empty': 'No users found.',
  'admin.users.roles_placeholder': 'Roles (comma-separated)',
  'admin.users.save_roles': 'Save roles',
  'admin.users.sessions': 'Sessions',
  'admin.users.create_section': 'Create user',
  'admin.users.create_name_placeholder': 'Name (optional)',
  'admin.users.create_email_placeholder': 'Email',
  'admin.users.create_password_placeholder': 'Password (leave blank to send invite)',
  'admin.users.create_submit': 'Create user',
  'admin.users.created': 'User created.',
  'admin.users.reset_password': 'Send password reset',
  'admin.users.reset_sent': 'Password reset email sent.',
  'admin.users.disable': 'Disable',
  'admin.users.enable': 'Enable',
  'admin.users.disabled': 'Account disabled.',
  'admin.users.enabled': 'Account enabled.',
  'admin.users.deleted': 'Account permanently deleted.',
  'admin.users.delete_unsupported': 'The account store does not support deleting users.',
  'admin.users.delete': 'Delete',
  'admin.users.delete_confirm': 'Permanently delete this account and all its data? This cannot be undone.',
  'admin.users.disabled_badge': 'Disabled',
  'admin.users.disable_confirm': 'Disable this account? The user will not be able to log in.',

  // Console admin — sessões/grants ativos de uma conta.
  'admin.sessions.page_title': 'Active sessions',
  'admin.sessions.title': 'Active sessions',
  'admin.sessions.account': 'Account: {email}',
  'admin.sessions.back': 'Back to users',
  'admin.sessions.not_supported':
    'The configured OIDC adapter does not support enumeration — session inspection is unavailable.',
  'admin.sessions.revoked_notice':
    'Revoked: {sessions} session(s), {grants} grant(s), {accessTokens} access token(s), {refreshTokens} refresh token(s).',
  'admin.sessions.sessions_section': 'Sessions (IdP login)',
  'admin.sessions.sessions_empty': 'No active sessions.',
  'admin.sessions.session_login_ts': 'Login: {date}',
  'admin.sessions.session_amr': 'Methods: {amr}',
  'admin.sessions.session_device': '{browser} on {os}',
  'admin.sessions.session_ip': 'IP: {ip}',
  'admin.sessions.session_ip_geo': 'IP: {ip} · {location}',
  'admin.sessions.grants_section': 'Grants (per-client authorizations)',
  'admin.sessions.grants_empty': 'No active grants.',
  'admin.sessions.grant_client': 'Client: {clientId}',
  'admin.sessions.grant_tokens': '{accessTokens} access · {refreshTokens} refresh',
  'admin.sessions.revoke_all': 'Revoke all sessions and grants',
  'admin.sessions.revoke_confirm':
    'Revoke all sessions and grants for this account? The user will need to log in again and issued tokens will stop working.',

  // Console admin — impersonation (RFC 8693 token exchange).
  'admin.impersonation.title': 'Impersonate this user',
  'admin.impersonation.help':
    'Token Exchange (RFC 8693) lets an admin act as this user. There is no auth bypass: you exchange YOUR OWN admin access token for one scoped to the target.',
  'admin.impersonation.curl_label': 'Ready-to-run request',
  'admin.impersonation.note':
    'Replace <ADMIN_ACCESS_TOKEN> with a current admin access token. The resulting id_token carries act={sub: admin}; the event is audited as impersonation.started.',
  'admin.impersonation.no_client':
    'No client has the token-exchange grant enabled. Add "urn:ietf:params:oauth:grant-type:token-exchange" to a client to enable impersonation.',

  // Console admin — clients.
  'admin.clients.page_title': 'OAuth clients',
  'admin.clients.title': 'OAuth clients',
  'admin.clients.empty': 'No clients configured.',
  'admin.clients.confidential': 'Confidential',
  'admin.clients.public': 'Public',
  'admin.clients.grants': 'Grants: {grants}',
  'admin.clients.redirect_uris': 'Redirects: {uris}',
  'admin.clients.dynamic_notice':
    'Dynamic client registration (RFC 7591) is on — clients registered via /reg are persisted in the adapter and appear in the dynamic section below.',
  'admin.clients.static_section': 'Static clients (config)',
  'admin.clients.dynamic_section': 'Dynamic clients (adapter)',
  'admin.clients.dynamic_empty': 'No dynamic clients persisted.',
  'admin.clients.dynamic_not_supported':
    'The configured OIDC adapter does not support client enumeration — dynamic management is unavailable.',
  'admin.clients.new': 'New client',
  'admin.clients.new_title': 'New OIDC client',
  'admin.clients.edit_title': 'Edit OIDC client',
  'admin.clients.edit': 'Edit',
  'admin.clients.delete': 'Delete',
  'admin.clients.delete_confirm': 'Delete this client? This action cannot be undone.',
  'admin.clients.regenerate_secret': 'Regenerate secret',
  'admin.clients.regenerate_confirm':
    'Regenerate the secret? The current secret will stop working immediately.',
  'admin.clients.back': 'Back',
  'admin.clients.cancel': 'Cancel',
  'admin.clients.save': 'Save',
  'admin.clients.create': 'Create client',
  'admin.clients.secret_once_title': 'Save the client_secret now',
  'admin.clients.secret_once_notice':
    'This is the only time the secret is shown. Copy it now — it cannot be retrieved later.',
  'admin.clients.field_client_id': 'Client ID',
  'admin.clients.field_client_id_placeholder': 'leave blank to generate automatically',
  'admin.clients.field_client_id_help':
    'Optional. If empty, a random identifier will be generated.',
  'admin.clients.field_redirect_uris': 'Redirect URIs',
  'admin.clients.field_redirect_uris_help': 'One URI per line.',
  'admin.clients.field_post_logout_uris': 'Post-logout redirect URIs',
  'admin.clients.field_post_logout_uris_help': 'One URI per line (optional).',
  'admin.clients.field_grant_types': 'Grant types',
  'admin.clients.field_auth_method': 'Token endpoint auth method',

  // Console admin — organizations.
  'admin.orgs.page_title': 'Organizations',
  'admin.orgs.title': 'Organizations',
  'admin.orgs.detail_title': 'Organization',
  'admin.orgs.not_supported': 'Organizations are not available in this installation.',
  'admin.orgs.empty': 'No organizations found.',
  'admin.orgs.create_section': 'Create organization',
  'admin.orgs.create_name_placeholder': 'Name',
  'admin.orgs.create_slug_placeholder': 'Slug (URL-friendly)',
  'admin.orgs.create_submit': 'Create organization',
  'admin.orgs.created': 'Organization created.',
  'admin.orgs.deleted': 'Organization deleted.',
  'admin.orgs.slug_taken': 'An organization with this slug already exists.',
  'admin.orgs.invalid_input': 'Name, slug and owner account are required.',
  'admin.orgs.view': 'View',
  'admin.orgs.delete': 'Delete',
  'admin.orgs.delete_confirm': 'Permanently delete this organization and all its members/invitations? This cannot be undone.',
  'admin.orgs.back': 'Back to organizations',
  'admin.orgs.members_section': 'Members',
  'admin.orgs.members_count': 'members',
  'admin.orgs.members_empty': 'No members.',
  'admin.orgs.add_member_section': 'Add member',
  'admin.orgs.select_account': '— Select account —',
  'admin.orgs.add_member_submit': 'Add member',
  'admin.orgs.member_added': 'Member added.',
  'admin.orgs.member_removed': 'Member removed.',
  'admin.orgs.member_add_error': 'Could not add member.',
  'admin.orgs.member_remove_error': 'Could not remove member.',
  'admin.orgs.member_remove_confirm': 'Remove this member?',
  'admin.orgs.remove_member': 'Remove',
  'admin.orgs.last_owner': 'Cannot remove the last owner.',
  'admin.orgs.invitations_section': 'Pending invitations',
  'admin.orgs.expires': 'Expires',
  'admin.orgs.revoke_invitation': 'Revoke',
  'admin.orgs.invitation_revoked': 'Invitation revoked.',
  'admin.orgs.danger_zone': 'Danger zone',

  // Console admin — auditoria.
  'admin.audit.page_title': 'Audit',
  'admin.audit.title': 'Audit log',
  'admin.audit.type_placeholder': 'Filter by type',
  'admin.audit.subject_placeholder': 'Filter by subject (accountId)',
  'admin.audit.filter': 'Filter',
  'admin.audit.empty': 'No events found.',
  'admin.audit.not_supported': 'The configured audit sink does not support querying.',

  // Console admin — settings (runtime configuration).
  'admin.settings.page_title': 'Settings',
  'admin.settings.title': 'Settings',
  'admin.settings.bot_protection_section': 'Bot protection',
  'admin.settings.bot_protection_intro':
    'Override the static config at runtime. The `verify` function always comes from config — only on/off and which actions are affected can be changed here.',
  'admin.settings.bot_protection_no_verify':
    'Bot protection is not configured — add `botProtection.verify` to config/authkit.ts to enable this feature.',
  'admin.settings.no_settings_table':
    'The `auth_settings` table is not present. To enable runtime settings, create it: `key TEXT PK, value TEXT NOT NULL, updated_at TIMESTAMP, updated_by TEXT`.',
  'admin.settings.enabled_label': 'Enabled',
  'admin.settings.actions_label': 'Active on',
  'admin.settings.action_login': 'Login',
  'admin.settings.action_signup': 'Signup',
  'admin.settings.action_reset': 'Password reset',
  'admin.settings.save': 'Save',
  'admin.settings.saved': 'Settings saved.',
  'admin.settings.reset_to_config': 'Reset to config',
  'admin.settings.reset_done': 'Runtime setting cleared — config is now the source of truth.',

  // Console admin — paginação compartilhada.
  'admin.pagination.page': 'Page {page} of {total}',
  'admin.pagination.prev': 'Previous',
  'admin.pagination.next': 'Next',

  // Device Authorization Grant (RFC 8628) — telas servidas pelo oidc-provider.
  'device.input.title': 'Sign in to the device',
  'device.input.intro': 'Enter the code shown on your device.',
  'device.input.submit': 'Continue',
  'device.input.error_invalid': 'The code you entered is incorrect. Please try again.',
  'device.input.error_aborted': 'The login request was aborted.',
  'device.input.error_generic': 'An error occurred while processing your request.',
  'device.confirm.title': 'Confirm device',
  'device.confirm.body':
    'The code below should be displayed on your device. Confirm only if you recognize it.',
  'device.confirm.submit': 'Continue',
  'device.confirm.abort': 'Cancel',
  'device.success.title': 'Login complete',
  'device.success.body': 'You are signed in. You can return to your device.',

  // Step-up auth (acr_values): cliente exige MFA mas a conta não tem MFA enrolado.
  'mfa_challenge.required_no_enrollment':
    'This client requires two-factor verification. Set up MFA in your account console to continue.',

  // Mensagens de erro/flash produzidas pelos controllers.
  'errors.invalid_credentials': 'Invalid credentials',
  'errors.invalid_code': 'Invalid code',
  'errors.account_disabled': 'This account has been disabled.',
  'errors.email_unverified':
    'Please verify your email address before signing in. Check your inbox for the verification link.',
  'errors.email_taken': 'Email already registered',
  'errors.signup_failed': 'Could not create the account',
  'errors.invalid_or_expired_token': 'Invalid or expired token',
  'errors.account_locked':
    'Account temporarily locked due to too many attempts. Try again in {seconds}s.',
  'errors.bot_protection_failed': 'Bot verification failed. Please try again.',
  'errors.session_expired': 'Session expired',
  'errors.challenge_expired': 'Challenge expired',
  'errors.passkeys_unavailable': 'Passkeys unavailable',
  'errors.no_passkey_registered': 'No passkey registered',

  // Política de senha (validação ao definir uma senha nova) + vazamento (HIBP).
  'password.policy.min_length': 'Password must be at least {min} characters long.',
  'password.policy.uppercase': 'Password must contain at least one uppercase letter.',
  'password.policy.lowercase': 'Password must contain at least one lowercase letter.',
  'password.policy.numbers': 'Password must contain at least one number.',
  'password.policy.symbols': 'Password must contain at least one symbol.',
  'password.pwned':
    'This password has appeared in known data breaches. Please choose a different one.',

  // Assuntos/corpos de e-mail transacional (default_mailer).
  'mail.common.link_fallback':
    "If the button does not work, copy and paste this link into your browser:",

  'mail.reset.subject': 'Reset your password',
  'mail.reset.heading': 'Reset your password',
  'mail.reset.intro': 'We received a request to reset the password for your account.',
  'mail.reset.cta': 'Reset password',
  'mail.reset.fallback': 'If you did not request this, you can ignore this email.',
  'mail.reset.expires': 'This link expires in {minutes} minutes.',

  'mail.verify.subject': 'Verify your email',
  'mail.verify.heading': 'Verify your email',
  'mail.verify.intro': 'Confirm your email address to finish setting up your account.',
  'mail.verify.cta': 'Verify email',
  'mail.verify.fallback': 'If you did not create this account, you can ignore this email.',
  'mail.verify.expires': 'This link expires in {minutes} minutes.',

  'mail.magic_link.subject': 'Your login link',
  'mail.magic_link.heading': 'Sign in to your account',
  'mail.magic_link.intro': 'Click the button below to sign in. The link expires shortly and can be used once.',
  'mail.magic_link.cta': 'Sign in',
  'mail.magic_link.fallback': 'If you did not request this, you can ignore this email.',

  'mail.new_login.subject': 'New login to your account',
  'mail.new_login.heading': 'New login detected',
  'mail.new_login.intro': 'We detected a new login to your account.',
  'mail.new_login.when': 'When: {date}',
  'mail.new_login.ip': 'IP address: {ip}',
  'mail.new_login.device': 'Device: {device}',
  'mail.new_login.fallback':
    'If this was you, no action is needed. If not, reset your password right away.',

  'mail.email_change.subject': 'Confirm your new email',
  'mail.email_change.heading': 'Confirm your new email',
  'mail.email_change.intro':
    'We received a request to change the email address on your account. Confirm the new address below.',
  'mail.email_change.cta': 'Confirm new email',
  'mail.email_change.fallback': 'If you did not request this, you can ignore this email.',
  'mail.email_change.expires': 'This link expires in {minutes} minutes.',
} satisfies AuthMessages

/**
 * Catálogo embutido pt-BR. Espelha TODAS as chaves do default `en`. Ativado
 * com `i18n: { locale: 'pt-BR' }` sem nenhuma config extra de mensagens.
 */
export const PT_BR_MESSAGES = {
  // Comum / fallback de marca.
  'common.app_fallback': 'Auth',
  'common.brand_eyebrow': 'Auth',

  // Tela de login (interaction OIDC: identifier + password).
  'login.page_title': 'Entrar',
  'login.title': 'Entrar',
  'login.identifier_intro': 'Informe seu e-mail para continuar.',
  'login.email_label': 'E-mail',
  'login.identifier_submit': 'Continuar',
  'login.create_account': 'Criar conta',
  'login.forgot_password': 'Esqueci a senha',
  'login.divider_or': 'ou',
  'login.google': 'Entrar com Google',
  'login.greeting': 'Olá, {name}',
  'login.switch_account': 'Trocar de conta',
  'login.password_label': 'Senha',
  'login.submit': 'Entrar',
  // Passwordless (login).
  'login.magic_link_button': 'Me envie um link de login',
  'login.magic_link_sent': 'Se a conta existir, enviamos um link de login.',
  'login.passkey_button': 'Entrar com passkey',

  // Tela de cadastro (signup).
  'signup.page_title': 'Criar conta',
  'signup.title': 'Criar conta',
  'signup.intro': 'Preencha seus dados para começar.',
  'signup.name_label': 'Nome',
  'signup.email_label': 'E-mail',
  'signup.password_label': 'Senha',
  'signup.submit': 'Criar conta',
  'signup.have_account': 'Já tenho conta',

  // Recuperação de senha (forgot).
  'forgot.page_title': 'Recuperar senha',
  'forgot.sent_title': 'E-mail enviado',
  'forgot.sent_body': 'Se o e-mail existir, enviaremos instruções de redefinição.',
  'forgot.title': 'Recuperar senha',
  'forgot.intro': 'Enviaremos um link para redefinir sua senha.',
  'forgot.email_label': 'E-mail',
  'forgot.submit': 'Enviar link',

  // Redefinição de senha (reset).
  'reset.page_title': 'Redefinir senha',
  'reset.done_title': 'Senha redefinida',
  'reset.done_body': 'Você já pode entrar com a nova senha.',
  'reset.title': 'Nova senha',
  'reset.intro': 'Escolha uma nova senha para sua conta.',
  'reset.password_label': 'Senha',
  'reset.submit': 'Redefinir',

  // Verificação de e-mail (verify-email).
  'verify_email.page_title': 'Verificar e-mail',
  'verify_email.verified_title': 'E-mail verificado',
  'verify_email.verified_body': 'Seu e-mail foi confirmado com sucesso.',
  'verify_email.invalid_title': 'Link inválido',
  'verify_email.invalid_body': 'O link de verificação é inválido ou já foi utilizado.',

  // Desafio de MFA no fluxo de login (mfa-challenge).
  'mfa_challenge.page_title': 'Verificação em duas etapas',
  'mfa_challenge.title': 'Verificação em duas etapas',
  'mfa_challenge.intro': 'Abra seu app autenticador e informe o código de 6 dígitos.',
  'mfa_challenge.code_label': 'Código',
  'mfa_challenge.submit': 'Verificar',
  'mfa_challenge.recovery_summary': 'Usar um código de recuperação',
  'mfa_challenge.recovery_submit': 'Entrar com código de recuperação',
  'mfa_challenge.passkey_button': 'Usar passkey',
  'mfa_challenge.passkey_error': 'Não foi possível autenticar com a passkey. Tente novamente.',
  'mfa_challenge.trust_device': 'Confiar neste dispositivo por {days} dias',

  // Consent (autorização de cliente OIDC).
  'consent.page_title': 'Autorizar',
  'consent.title': 'Autorizar acesso',
  'consent.body': 'O app <strong>{app}</strong> quer acessar sua conta.',
  'consent.submit': 'Autorizar',

  // Console de conta — login (account/login).
  'account.login.page_title': 'Minha conta',
  'account.login.title': 'Minha conta',
  'account.login.intro': 'Gerencie seus tokens de acesso.',
  'account.login.email_label': 'E-mail',
  'account.login.password_label': 'Senha',
  'account.login.submit': 'Entrar',

  // Console de conta — tokens (account/tokens).
  'account.tokens.page_title': 'Tokens de acesso',
  'account.tokens.title': 'Tokens de acesso',
  'account.tokens.logout': 'Sair',
  'account.tokens.security': 'Segurança',
  'account.tokens.created_notice': 'Token criado — copie agora, não será mostrado de novo:',
  'account.tokens.name_placeholder': 'Nome do token (ex.: CI deploy)',
  'account.tokens.create': 'Criar',
  'account.tokens.empty': 'Nenhum token ainda.',
  'account.tokens.created_at': 'Criado em {date}',
  'account.tokens.last_used': '· último uso {date}',
  'account.tokens.never_used': '· nunca usado',
  'account.tokens.scopes': 'Escopos: {scopes}',
  'account.tokens.audience': 'Audiência: {audience}',
  'account.tokens.revoke': 'Revogar',

  // Console de conta — segurança (account/security): senha + e-mail.
  'account.security.page_title': 'Segurança da conta',
  'account.security.title': 'Segurança da conta',
  'account.security.logout': 'Sair',
  'account.security.current_email': 'E-mail atual: {email}',
  'account.security.not_supported':
    'A troca de senha e e-mail não está disponível nesta instalação.',
  'account.security.password_section': 'Trocar senha',
  'account.security.current_password_label': 'Senha atual',
  'account.security.new_password_label': 'Nova senha',
  'account.security.change_password_submit': 'Trocar senha',
  'account.security.password_changed': 'Senha alterada com sucesso.',
  'account.security.email_section': 'Trocar e-mail',
  'account.security.email_intro':
    'Enviaremos um link de confirmação para o novo endereço. A troca só é aplicada após a confirmação.',
  'account.security.new_email_label': 'Novo e-mail',
  'account.security.email_password_label': 'Senha atual',
  'account.security.change_email_submit': 'Solicitar troca de e-mail',
  'account.security.email_change_requested':
    'Enviamos um link de confirmação para {email}. Clique nele para concluir a troca.',
  'account.security.email_changed': 'E-mail alterado com sucesso.',
  // Trusted devices (account/security).
  'account.security.trusted_devices_section': 'Dispositivos confiáveis',
  'account.security.trusted_devices_intro':
    'Você pode deixar de confiar neste navegador para que a verificação em duas etapas volte a ser exigida aqui. Para revogar a confiança em todos os dispositivos, refaça o cadastro do seu autenticador.',
  'account.security.trusted_devices_revoke': 'Deixar de confiar neste dispositivo',
  'account.security.trusted_devices_revoked':
    'Este dispositivo não é mais confiável. A verificação em duas etapas voltará a ser exigida aqui.',
  'account.security.sessions_section': 'Sessões ativas',
  'account.security.sessions_intro': 'Dispositivos e locais onde sua conta está logada agora.',
  'account.security.sessions_empty': 'Nenhuma sessão ativa.',

  // Console de conta — perfil (seção em account/security).
  'account.profile.section': 'Perfil',
  'account.profile.intro': 'Atualize seu nome de exibição e avatar.',
  'account.profile.name_label': 'Nome',
  'account.profile.avatar_label': 'URL do avatar',
  'account.profile.avatar_upload_label': 'Enviar avatar',
  'account.profile.avatar_upload_hint': 'JPG, PNG ou WebP, até 5MB.',
  'account.profile.avatar_invalid_type': 'Tipo de imagem inválido. Use JPG, PNG ou WebP.',
  'account.profile.avatar_too_large': 'A imagem é muito grande.',
  'account.profile.submit': 'Salvar perfil',
  'account.profile.updated': 'Perfil atualizado com sucesso.',
  'account.profile.not_supported': 'A edição de perfil não está disponível nesta instalação.',

  // Console de conta — exportar dados (portabilidade, LGPD/GDPR).
  'account.export.section': 'Exportar seus dados',
  'account.export.intro':
    'Baixe uma cópia dos seus dados: perfil, identidades vinculadas, apps autorizados, sessões ativas, passkeys e seu histórico de auditoria. Nenhum segredo ou token é incluído.',
  'account.export.submit': 'Baixar meus dados (JSON)',

  // Console de conta — deletar conta (danger zone, LGPD/GDPR).
  'account.delete.section': 'Deletar conta',
  'account.delete.intro':
    'Apaga permanentemente sua conta e todos os dados associados: sessões, apps autorizados, tokens de acesso pessoal, passkeys, identidades vinculadas e segredos de duplo fator. Esta ação não pode ser desfeita.',
  'account.delete.confirm_password_label': 'Confirme com sua senha atual',
  'account.delete.confirm_email_label': 'Digite seu e-mail para confirmar',
  'account.delete.submit': 'Deletar minha conta',
  'account.delete.deleted': 'Sua conta foi deletada permanentemente.',
  'account.delete.invalid_confirmation': 'Confirmação falhou. Sua conta NÃO foi deletada.',
  'account.delete.not_supported': 'A deleção de conta não está disponível nesta instalação.',

  // Console de conta — apps com acesso (account/apps).
  'account.apps.page_title': 'Apps com acesso',
  'account.apps.title': 'Apps com acesso',
  'account.apps.intro': 'Apps que você autorizou a acessar sua conta.',
  'account.apps.logout': 'Sair',
  'account.apps.empty': 'Nenhum app tem acesso à sua conta.',
  'account.apps.tokens': '{accessTokens} access · {refreshTokens} refresh',
  'account.apps.revoke': 'Revogar acesso',
  'account.apps.revoke_confirm':
    'Revogar o acesso deste app? Ele precisará ser autorizado novamente e seus tokens deixarão de funcionar.',
  'account.apps.revoked': 'Acesso revogado.',
  'account.apps.not_supported':
    'O adapter OIDC configurado não suporta enumeração — a listagem de apps fica indisponível.',

  // Console de conta — organizations (account/orgs).
  'account.orgs.page_title': 'Minhas Organizações',
  'account.orgs.title': 'Minhas Organizações',
  'account.orgs.logout': 'Sair',
  'account.orgs.empty': 'Você não é membro de nenhuma organização.',
  'account.orgs.active_badge': 'Ativa',
  'account.orgs.activate': 'Definir como ativa',
  'account.orgs.deactivate': 'Desativar',
  'account.orgs.leave': 'Sair',
  'account.orgs.leave_last_owner': 'Não é possível sair — você é o único proprietário.',
  'account.orgs.create_section': 'Criar organização',
  'account.orgs.create_name_label': 'Nome',
  'account.orgs.create_slug_label': 'Slug (identificador de URL)',
  'account.orgs.create_submit': 'Criar organização',
  'account.orgs.created': 'Organização criada.',
  'account.orgs.activated': 'Organização ativada.',
  'account.orgs.deactivated': 'Organização desativada.',
  'account.orgs.left': 'Você saiu da organização.',
  'account.orgs.not_supported': 'Organizations não está disponível nesta instalação.',
  'account.orgs.not_member': 'Você não é membro desta organização.',
  'account.orgs.invitations_section': 'Convites pendentes',
  'account.orgs.invitations_empty': 'Nenhum convite pendente.',
  'account.orgs.invitation_from': 'Convidado para {orgName} como {role}',
  'account.orgs.invitation_accept': 'Aceitar',
  'account.orgs.invitation_accepted': 'Convite aceito.',
  'account.orgs.invitation_error': 'Não foi possível aceitar o convite.',
  'account.orgs.members_section': 'Membros',
  'account.orgs.invite_section': 'Convidar por e-mail',
  'account.orgs.invite_email_label': 'E-mail',
  'account.orgs.invite_role_label': 'Papel',
  'account.orgs.invite_submit': 'Enviar convite',
  'account.orgs.invited': 'Convite enviado.',
  'account.orgs.remove_member': 'Remover',
  'account.orgs.member_removed': 'Membro removido.',
  'account.orgs.change_role': 'Alterar papel',
  'account.orgs.role_updated': 'Papel atualizado.',

  // Confirmação de troca de e-mail (account/email-confirmed).
  'account.email_confirmed.page_title': 'Confirmação de e-mail',
  'account.email_confirmed.ok_title': 'E-mail alterado',
  'account.email_confirmed.ok_body': 'Seu novo e-mail foi confirmado e já está ativo.',
  'account.email_confirmed.invalid_title': 'Link inválido',
  'account.email_confirmed.invalid_body':
    'O link de confirmação é inválido ou já foi utilizado.',

  // Console de conta — MFA (account/mfa).
  'account.mfa.page_title': 'Verificação em duas etapas',
  'account.mfa.title': 'Verificação em duas etapas',
  'account.mfa.logout': 'Sair',
  'account.mfa.recovery_codes_notice':
    'Guarde seus códigos de recuperação — eles não serão mostrados de novo:',
  'account.mfa.enroll_intro':
    'Escaneie o QR code com seu app autenticador (Google Authenticator, 1Password, etc.).',
  'account.mfa.qr_alt': 'QR code TOTP',
  'account.mfa.manual_intro': 'Ou informe manualmente:',
  'account.mfa.confirm_code_label': 'Código de confirmação',
  'account.mfa.activate': 'Ativar verificação em duas etapas',
  'account.mfa.enabled_html':
    'A verificação em duas etapas está <span class="font-semibold text-emerald-700">ativa</span> nesta conta.',
  'account.mfa.disable': 'Desativar',
  'account.mfa.disabled_intro':
    'A verificação em duas etapas está desativada. Ative-a para proteger sua conta com um app autenticador.',
  'account.mfa.enable': 'Ativar verificação em duas etapas',

  // Console de conta — passkeys (WebAuthn) na tela de MFA.
  'mfa.passkey.section_title': 'Passkeys (chaves de acesso)',
  'mfa.passkey.section_intro':
    'Use uma chave de acesso (biometria, PIN do dispositivo ou chave de segurança) como segundo fator, sem precisar digitar códigos.',
  'mfa.passkey.add': 'Adicionar passkey',
  'mfa.passkey.remove': 'Remover',
  'mfa.passkey.empty': 'Nenhuma passkey registrada.',
  'mfa.passkey.unnamed': 'Passkey',
  'mfa.passkey.created_at': 'Criada em {date}',
  'mfa.passkey.register_error': 'Não foi possível registrar a passkey. Tente novamente.',
  'mfa.passkey.unsupported': 'Seu navegador não suporta passkeys.',

  // Console admin (B6) — navegação compartilhada.
  'admin.nav.dashboard': 'Painel',
  'admin.nav.users': 'Usuários',
  'admin.nav.orgs': 'Organizações',
  'admin.nav.clients': 'Clients',
  'admin.nav.audit': 'Auditoria',
  'admin.nav.settings': 'Configurações',
  'admin.nav.logout': 'Sair',

  // Console admin — dashboard.
  'admin.dashboard.page_title': 'Painel admin',
  'admin.dashboard.title': 'Painel administrativo',
  'admin.dashboard.users_count': 'Usuários',
  'admin.dashboard.clients_count': 'Clients',
  'admin.dashboard.audit_count': 'Eventos de auditoria',
  'admin.dashboard.recent_title': 'Eventos recentes',
  'admin.dashboard.mau': 'Usuários ativos (30d)',
  'admin.dashboard.active_sessions': 'Sessões ativas',
  'admin.dashboard.signins_title': 'Logins (últimos {days}d)',
  'admin.dashboard.signups_title': 'Cadastros (últimos {days}d)',

  // Console admin — usuários.
  'admin.users.page_title': 'Usuários',
  'admin.users.title': 'Usuários',
  'admin.users.search_placeholder': 'Buscar por e-mail',
  'admin.users.search': 'Buscar',
  'admin.users.empty': 'Nenhum usuário encontrado.',
  'admin.users.roles_placeholder': 'Papéis (separados por vírgula)',
  'admin.users.save_roles': 'Salvar papéis',
  'admin.users.sessions': 'Sessões',
  'admin.users.create_section': 'Criar usuário',
  'admin.users.create_name_placeholder': 'Nome (opcional)',
  'admin.users.create_email_placeholder': 'E-mail',
  'admin.users.create_password_placeholder': 'Senha (deixe em branco para enviar convite)',
  'admin.users.create_submit': 'Criar usuário',
  'admin.users.created': 'Usuário criado.',
  'admin.users.reset_password': 'Enviar redefinição de senha',
  'admin.users.reset_sent': 'E-mail de redefinição de senha enviado.',
  'admin.users.disable': 'Desabilitar',
  'admin.users.enable': 'Reabilitar',
  'admin.users.disabled': 'Conta desabilitada.',
  'admin.users.enabled': 'Conta reabilitada.',
  'admin.users.deleted': 'Conta deletada permanentemente.',
  'admin.users.delete_unsupported': 'O store de contas não suporta deletar usuários.',
  'admin.users.delete': 'Deletar',
  'admin.users.delete_confirm': 'Deletar permanentemente esta conta e todos os dados? Não pode ser desfeito.',
  'admin.users.disabled_badge': 'Desabilitada',
  'admin.users.disable_confirm': 'Desabilitar esta conta? O usuário não conseguirá entrar.',

  // Console admin — organizations (pt-BR).
  'admin.orgs.page_title': 'Organizações',
  'admin.orgs.title': 'Organizações',
  'admin.orgs.detail_title': 'Organização',
  'admin.orgs.not_supported': 'Organizações não estão disponíveis nesta instalação.',
  'admin.orgs.empty': 'Nenhuma organização encontrada.',
  'admin.orgs.create_section': 'Criar organização',
  'admin.orgs.create_name_placeholder': 'Nome',
  'admin.orgs.create_slug_placeholder': 'Slug (identificador na URL)',
  'admin.orgs.create_submit': 'Criar organização',
  'admin.orgs.created': 'Organização criada.',
  'admin.orgs.deleted': 'Organização deletada.',
  'admin.orgs.slug_taken': 'Já existe uma organização com este slug.',
  'admin.orgs.invalid_input': 'Nome, slug e conta owner são obrigatórios.',
  'admin.orgs.view': 'Ver',
  'admin.orgs.delete': 'Deletar',
  'admin.orgs.delete_confirm': 'Deletar permanentemente esta organização e todos os membros/convites? Não pode ser desfeito.',
  'admin.orgs.back': 'Voltar para organizações',
  'admin.orgs.members_section': 'Membros',
  'admin.orgs.members_count': 'membros',
  'admin.orgs.members_empty': 'Nenhum membro.',
  'admin.orgs.add_member_section': 'Adicionar membro',
  'admin.orgs.select_account': '— Selecione a conta —',
  'admin.orgs.add_member_submit': 'Adicionar membro',
  'admin.orgs.member_added': 'Membro adicionado.',
  'admin.orgs.member_removed': 'Membro removido.',
  'admin.orgs.member_add_error': 'Não foi possível adicionar o membro.',
  'admin.orgs.member_remove_error': 'Não foi possível remover o membro.',
  'admin.orgs.member_remove_confirm': 'Remover este membro?',
  'admin.orgs.remove_member': 'Remover',
  'admin.orgs.last_owner': 'Não é possível remover o último owner.',
  'admin.orgs.invitations_section': 'Convites pendentes',
  'admin.orgs.expires': 'Expira',
  'admin.orgs.revoke_invitation': 'Revogar',
  'admin.orgs.invitation_revoked': 'Convite revogado.',
  'admin.orgs.danger_zone': 'Zona de perigo',

  // Console admin — sessões/grants ativos de uma conta.
  'admin.sessions.page_title': 'Sessões ativas',
  'admin.sessions.title': 'Sessões ativas',
  'admin.sessions.account': 'Conta: {email}',
  'admin.sessions.back': 'Voltar para usuários',
  'admin.sessions.not_supported':
    'O adapter OIDC configurado não suporta enumeração — a inspeção de sessões fica indisponível.',
  'admin.sessions.revoked_notice':
    'Revogado: {sessions} sessão(ões), {grants} grant(s), {accessTokens} access token(s), {refreshTokens} refresh token(s).',
  'admin.sessions.sessions_section': 'Sessões (login no IdP)',
  'admin.sessions.sessions_empty': 'Nenhuma sessão ativa.',
  'admin.sessions.session_login_ts': 'Login: {date}',
  'admin.sessions.session_amr': 'Métodos: {amr}',
  'admin.sessions.session_device': '{browser} em {os}',
  'admin.sessions.session_ip': 'IP: {ip}',
  'admin.sessions.session_ip_geo': 'IP: {ip} · {location}',
  'admin.sessions.grants_section': 'Grants (autorizações por client)',
  'admin.sessions.grants_empty': 'Nenhum grant ativo.',
  'admin.sessions.grant_client': 'Client: {clientId}',
  'admin.sessions.grant_tokens': '{accessTokens} access · {refreshTokens} refresh',
  'admin.sessions.revoke_all': 'Revogar todas as sessões e grants',
  'admin.sessions.revoke_confirm':
    'Revogar todas as sessões e grants desta conta? O usuário precisará entrar novamente e os tokens emitidos deixarão de funcionar.',

  // Console admin — impersonation (RFC 8693 token exchange).
  'admin.impersonation.title': 'Personificar este usuário',
  'admin.impersonation.help':
    'O Token Exchange (RFC 8693) permite que um admin aja como este usuário. Não há bypass de auth: você troca o SEU PRÓPRIO access token de admin por um escopado ao alvo.',
  'admin.impersonation.curl_label': 'Requisição pronta para rodar',
  'admin.impersonation.note':
    'Troque <ADMIN_ACCESS_TOKEN> por um access token de admin válido. O id_token resultante carrega act={sub: admin}; o evento é auditado como impersonation.started.',
  'admin.impersonation.no_client':
    'Nenhum client tem o grant token-exchange habilitado. Adicione "urn:ietf:params:oauth:grant-type:token-exchange" a um client para habilitar a personificação.',

  // Console admin — clients.
  'admin.clients.page_title': 'Clients OAuth',
  'admin.clients.title': 'Clients OAuth',
  'admin.clients.empty': 'Nenhum client configurado.',
  'admin.clients.confidential': 'Confidencial',
  'admin.clients.public': 'Público',
  'admin.clients.grants': 'Grants: {grants}',
  'admin.clients.redirect_uris': 'Redirects: {uris}',
  'admin.clients.dynamic_notice':
    'O registro dinâmico de clients (RFC 7591) está ligado — clients registrados via /reg são persistidos no adapter e aparecem na seção dinâmica abaixo.',
  'admin.clients.static_section': 'Clients estáticos (config)',
  'admin.clients.dynamic_section': 'Clients dinâmicos (adapter)',
  'admin.clients.dynamic_empty': 'Nenhum client dinâmico persistido.',
  'admin.clients.dynamic_not_supported':
    'O adapter OIDC configurado não suporta enumeração de clients — a gestão dinâmica fica indisponível.',
  'admin.clients.new': 'Novo client',
  'admin.clients.new_title': 'Novo client OIDC',
  'admin.clients.edit_title': 'Editar client OIDC',
  'admin.clients.edit': 'Editar',
  'admin.clients.delete': 'Excluir',
  'admin.clients.delete_confirm': 'Excluir este client? Esta ação não pode ser desfeita.',
  'admin.clients.regenerate_secret': 'Regenerar secret',
  'admin.clients.regenerate_confirm':
    'Regenerar o secret? O secret atual deixará de funcionar imediatamente.',
  'admin.clients.back': 'Voltar',
  'admin.clients.cancel': 'Cancelar',
  'admin.clients.save': 'Salvar',
  'admin.clients.create': 'Criar client',
  'admin.clients.secret_once_title': 'Guarde o client_secret agora',
  'admin.clients.secret_once_notice':
    'Este é o único momento em que o secret é exibido. Copie-o agora — ele não pode ser recuperado depois.',
  'admin.clients.field_client_id': 'Client ID',
  'admin.clients.field_client_id_placeholder': 'deixe em branco para gerar automaticamente',
  'admin.clients.field_client_id_help':
    'Opcional. Se vazio, um identificador aleatório será gerado.',
  'admin.clients.field_redirect_uris': 'Redirect URIs',
  'admin.clients.field_redirect_uris_help': 'Uma URI por linha.',
  'admin.clients.field_post_logout_uris': 'Post-logout redirect URIs',
  'admin.clients.field_post_logout_uris_help': 'Uma URI por linha (opcional).',
  'admin.clients.field_grant_types': 'Grant types',
  'admin.clients.field_auth_method': 'Token endpoint auth method',

  // Console admin — auditoria.
  'admin.audit.page_title': 'Auditoria',
  'admin.audit.title': 'Log de auditoria',
  'admin.audit.type_placeholder': 'Filtrar por tipo',
  'admin.audit.subject_placeholder': 'Filtrar por subject (accountId)',
  'admin.audit.filter': 'Filtrar',
  'admin.audit.empty': 'Nenhum evento encontrado.',
  'admin.audit.not_supported': 'O sink de auditoria configurado não suporta consulta.',

  // Console admin — settings (runtime configuration) — pt-BR.
  'admin.settings.page_title': 'Configurações',
  'admin.settings.title': 'Configurações',
  'admin.settings.bot_protection_section': 'Bot protection',
  'admin.settings.bot_protection_intro':
    'Sobrescreva a config estática em tempo de execução. A função `verify` sempre vem do config — aqui só é possível ligar/desligar e escolher as ações afetadas.',
  'admin.settings.bot_protection_no_verify':
    'Bot protection não está configurado — adicione `botProtection.verify` ao config/authkit.ts para habilitar esta feature.',
  'admin.settings.no_settings_table':
    'A tabela `auth_settings` não existe. Para habilitar configurações em runtime, crie-a: `key TEXT PK, value TEXT NOT NULL, updated_at TIMESTAMP, updated_by TEXT`.',
  'admin.settings.enabled_label': 'Habilitado',
  'admin.settings.actions_label': 'Ativo em',
  'admin.settings.action_login': 'Login',
  'admin.settings.action_signup': 'Cadastro',
  'admin.settings.action_reset': 'Redefinição de senha',
  'admin.settings.save': 'Salvar',
  'admin.settings.saved': 'Configurações salvas.',
  'admin.settings.reset_to_config': 'Resetar ao config',
  'admin.settings.reset_done': 'Setting em runtime apagado — o config estático voltou a ser a fonte de verdade.',

  // Console admin — paginação compartilhada.
  'admin.pagination.page': 'Página {page} de {total}',
  'admin.pagination.prev': 'Anterior',
  'admin.pagination.next': 'Próxima',

  // Device Authorization Grant (RFC 8628) — telas servidas pelo oidc-provider.
  'device.input.title': 'Entrar no dispositivo',
  'device.input.intro': 'Digite o código exibido no seu dispositivo.',
  'device.input.submit': 'Continuar',
  'device.input.error_invalid': 'O código informado está incorreto. Tente novamente.',
  'device.input.error_aborted': 'A solicitação de login foi interrompida.',
  'device.input.error_generic': 'Ocorreu um erro ao processar sua solicitação.',
  'device.confirm.title': 'Confirmar dispositivo',
  'device.confirm.body':
    'O código abaixo deve estar sendo exibido no seu dispositivo. Confirme apenas se reconhecê-lo.',
  'device.confirm.submit': 'Continuar',
  'device.confirm.abort': 'Cancelar',
  'device.success.title': 'Login concluído',
  'device.success.body': 'Login realizado com sucesso. Você já pode voltar ao dispositivo.',

  // Step-up auth (acr_values): cliente exige MFA mas a conta não tem MFA enrolado.
  'mfa_challenge.required_no_enrollment':
    'Este cliente exige verificação em duas etapas. Configure o MFA no console da sua conta para continuar.',

  // Mensagens de erro/flash produzidas pelos controllers.
  'errors.invalid_credentials': 'Credenciais inválidas',
  'errors.invalid_code': 'Código inválido',
  'errors.account_disabled': 'Esta conta foi desabilitada.',
  'errors.email_unverified':
    'Verifique seu e-mail antes de entrar. Procure o link de verificação na sua caixa de entrada.',
  'errors.email_taken': 'E-mail já cadastrado',
  'errors.signup_failed': 'Não foi possível criar a conta',
  'errors.invalid_or_expired_token': 'Token inválido ou expirado',
  'errors.account_locked':
    'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em {seconds}s.',
  'errors.bot_protection_failed': 'A verificação anti-bot falhou. Tente novamente.',
  'errors.session_expired': 'Sessão expirada',
  'errors.challenge_expired': 'Desafio expirado',
  'errors.passkeys_unavailable': 'Passkeys indisponíveis',
  'errors.no_passkey_registered': 'Nenhuma passkey registrada',

  // Política de senha (validação ao definir uma senha nova) + vazamento (HIBP).
  'password.policy.min_length': 'A senha deve ter no mínimo {min} caracteres.',
  'password.policy.uppercase': 'A senha deve conter ao menos uma letra maiúscula.',
  'password.policy.lowercase': 'A senha deve conter ao menos uma letra minúscula.',
  'password.policy.numbers': 'A senha deve conter ao menos um número.',
  'password.policy.symbols': 'A senha deve conter ao menos um símbolo.',
  'password.pwned':
    'Esta senha apareceu em vazamentos de dados conhecidos. Escolha uma senha diferente.',

  // Assuntos/corpos de e-mail transacional (default_mailer).
  'mail.common.link_fallback':
    'Se o botão não funcionar, copie e cole este link no navegador:',

  'mail.reset.subject': 'Redefinição de senha',
  'mail.reset.heading': 'Redefinição de senha',
  'mail.reset.intro': 'Recebemos um pedido para redefinir a senha da sua conta.',
  'mail.reset.cta': 'Redefinir senha',
  'mail.reset.fallback': 'Se você não solicitou isso, pode ignorar este e-mail.',
  'mail.reset.expires': 'Este link expira em {minutes} minutos.',

  'mail.verify.subject': 'Verifique seu e-mail',
  'mail.verify.heading': 'Verifique seu e-mail',
  'mail.verify.intro': 'Confirme seu endereço de e-mail para concluir a configuração da conta.',
  'mail.verify.cta': 'Verificar e-mail',
  'mail.verify.fallback': 'Se você não criou esta conta, pode ignorar este e-mail.',
  'mail.verify.expires': 'Este link expira em {minutes} minutos.',

  'mail.magic_link.subject': 'Seu link de login',
  'mail.magic_link.heading': 'Entrar na sua conta',
  'mail.magic_link.intro': 'Clique no botão abaixo para entrar. O link expira em breve e pode ser usado uma vez.',
  'mail.magic_link.cta': 'Entrar',
  'mail.magic_link.fallback': 'Se você não solicitou isso, pode ignorar este e-mail.',

  'mail.new_login.subject': 'Novo login na sua conta',
  'mail.new_login.heading': 'Novo login detectado',
  'mail.new_login.intro': 'Detectamos um novo login na sua conta.',
  'mail.new_login.when': 'Quando: {date}',
  'mail.new_login.ip': 'Endereço IP: {ip}',
  'mail.new_login.device': 'Dispositivo: {device}',
  'mail.new_login.fallback':
    'Se foi você, nenhuma ação é necessária. Caso contrário, redefina sua senha imediatamente.',

  'mail.email_change.subject': 'Confirme seu novo e-mail',
  'mail.email_change.heading': 'Confirme seu novo e-mail',
  'mail.email_change.intro':
    'Recebemos um pedido para trocar o e-mail da sua conta. Confirme o novo endereço abaixo.',
  'mail.email_change.cta': 'Confirmar novo e-mail',
  'mail.email_change.fallback': 'Se você não solicitou isso, pode ignorar este e-mail.',
  'mail.email_change.expires': 'Este link expira em {minutes} minutos.',
} satisfies AuthMessages

/**
 * Locales embutidos no host-kit. O `en` é o default; o `pt-BR` está disponível
 * com `i18n: { locale: 'pt-BR' }` sem nenhuma config de mensagens extra. Os
 * overrides/locales do host (via `I18nConfig.messages`) são mesclados por cima.
 */
export const BUILTIN_MESSAGES: Record<string, AuthMessages> = {
  en: DEFAULT_MESSAGES,
  'pt-BR': PT_BR_MESSAGES,
}

/**
 * Resolve o catálogo ativo. Começa do catálogo embutido do locale selecionado
 * (ou do default `en` quando o locale não é embutido), depois mescla os
 * overrides do host por cima. Sem config, retorna o default `en` intacto.
 * Chaves omitidas caem no default `en` (fallback de cobertura).
 */
export function resolveMessages(i18n?: I18nConfig): AuthMessages {
  const locale = i18n?.locale ?? DEFAULT_LOCALE
  // Base: sempre o default `en` para garantir cobertura total das chaves; o
  // catálogo embutido do locale (ex.: pt-BR) é mesclado por cima.
  const base: AuthMessages = { ...DEFAULT_MESSAGES, ...(BUILTIN_MESSAGES[locale] ?? {}) }
  const overrides = i18n?.messages?.[locale]
  if (!overrides) return base
  // Mescla só valores definidos (o `Partial` permite undefined); chaves omitidas
  // seguem caindo no catálogo base.
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) base[key] = value
  }
  return base
}

/**
 * Retorna a string para `key` (cai na própria `key` quando ausente) com
 * interpolação no estilo `{name}`. Mantém placeholders sem valor intactos.
 */
export function translate(
  messages: AuthMessages,
  key: string,
  params?: Record<string, string | number>
): string {
  const template = messages[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
