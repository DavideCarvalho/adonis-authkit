/**
 * Internacionalização (i18n) das telas do host-kit.
 *
 * Todas as strings visíveis ao usuário das views Edge (e as mensagens de
 * flash/erro produzidas pelos controllers) vivem num catálogo achatado de
 * chaves pontilhadas. O default embutido é pt-BR — os apps continuam
 * funcionando SEM nenhuma configuração. O host pode sobrescrever chaves
 * pontuais ou fornecer locales inteiros (ex.: `en`) via `I18nConfig`.
 */

/** Catálogo achatado de chaves de mensagem → strings. */
export type AuthMessages = Record<string, string>

export interface I18nConfig {
  /** Locale ativo. Default: 'pt-BR'. */
  locale?: string
  /**
   * Locales adicionais e/ou overrides pontuais. As chaves do locale ativo são
   * mescladas SOBRE o default pt-BR — então o host pode trocar só algumas
   * chaves ou trazer um locale novo por completo.
   */
  messages?: Record<string, Partial<AuthMessages>>
}

/** Locale default do host-kit. */
export const DEFAULT_LOCALE = 'pt-BR'

/**
 * Catálogo default (pt-BR) — cobre TODAS as strings visíveis ao usuário das
 * views e as mensagens de flash/erro dos controllers. Chaves agrupadas por tela.
 */
export const DEFAULT_MESSAGES = {
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

  // Consent (autorização de cliente OIDC).
  'consent.page_title': 'Autorizar',
  'consent.title': 'Autorizar acesso',
  // `{app}` é interpolado com o nome do app já envolto em <strong> (renderizado
  // raw na view). O nome vem do branding (config-trusted).
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
  'admin.nav.clients': 'Clients',
  'admin.nav.audit': 'Auditoria',
  'admin.nav.logout': 'Sair',

  // Console admin — dashboard.
  'admin.dashboard.page_title': 'Painel admin',
  'admin.dashboard.title': 'Painel administrativo',
  'admin.dashboard.users_count': 'Usuários',
  'admin.dashboard.clients_count': 'Clients',
  'admin.dashboard.audit_count': 'Eventos de auditoria',
  'admin.dashboard.recent_title': 'Eventos recentes',

  // Console admin — usuários.
  'admin.users.page_title': 'Usuários',
  'admin.users.title': 'Usuários',
  'admin.users.search_placeholder': 'Buscar por e-mail',
  'admin.users.search': 'Buscar',
  'admin.users.empty': 'Nenhum usuário encontrado.',
  'admin.users.roles_placeholder': 'Papéis (separados por vírgula)',
  'admin.users.save_roles': 'Salvar papéis',

  // Console admin — clients.
  'admin.clients.page_title': 'Clients OAuth',
  'admin.clients.title': 'Clients OAuth',
  'admin.clients.empty': 'Nenhum client configurado.',
  'admin.clients.confidential': 'Confidencial',
  'admin.clients.public': 'Público',
  'admin.clients.grants': 'Grants: {grants}',
  'admin.clients.redirect_uris': 'Redirects: {uris}',
  'admin.clients.dynamic_notice':
    'O registro dinâmico de clients está ligado — clients registrados via /reg vivem no adapter e não aparecem nesta lista.',

  // Console admin — auditoria.
  'admin.audit.page_title': 'Auditoria',
  'admin.audit.title': 'Log de auditoria',
  'admin.audit.type_placeholder': 'Filtrar por tipo',
  'admin.audit.subject_placeholder': 'Filtrar por subject (accountId)',
  'admin.audit.filter': 'Filtrar',
  'admin.audit.empty': 'Nenhum evento encontrado.',
  'admin.audit.not_supported':
    'O sink de auditoria configurado não suporta consulta.',

  // Console admin — paginação compartilhada.
  'admin.pagination.page': 'Página {page} de {total}',
  'admin.pagination.prev': 'Anterior',
  'admin.pagination.next': 'Próxima',

  // Mensagens de erro/flash produzidas pelos controllers.
  'errors.invalid_credentials': 'Credenciais inválidas',
  'errors.invalid_code': 'Código inválido',
  'errors.email_taken': 'E-mail já cadastrado',
  'errors.signup_failed': 'Não foi possível criar a conta',
  'errors.invalid_or_expired_token': 'Token inválido ou expirado',
  'errors.account_locked':
    'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em {seconds}s.',
} satisfies AuthMessages

/**
 * Resolve o catálogo ativo: mescla os overrides do locale selecionado SOBRE o
 * default pt-BR. Sem config, retorna os defaults intactos. Chaves omitidas pelo
 * locale escolhido caem no default pt-BR (fallback de cobertura).
 */
export function resolveMessages(i18n?: I18nConfig): AuthMessages {
  const base: AuthMessages = { ...DEFAULT_MESSAGES }
  const locale = i18n?.locale ?? DEFAULT_LOCALE
  const overrides = i18n?.messages?.[locale]
  if (!overrides) return base
  // Mescla só valores definidos (o `Partial` permite undefined); chaves omitidas
  // seguem caindo no default pt-BR.
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
