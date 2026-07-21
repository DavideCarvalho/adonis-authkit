import type { HttpContext } from '@adonisjs/core/http'
import { DEFAULT_MESSAGES, type AuthMessages } from '../i18n.js'
import { renderEdgeView } from './edge_renderer.js'

/**
 * Resolve o catálogo de mensagens ativo a partir do `authkit.server`. Defensivo:
 * sem container/serviço (ex.: teste unitário com ctx mockado), cai no default
 * pt-BR embutido.
 */
async function resolveMessagesFromCtx(ctx: HttpContext): Promise<AuthMessages> {
  try {
    const service = await (ctx as any).containerResolver?.make?.('authkit.server')
    const messages = service?.config?.messages as AuthMessages | undefined
    if (messages) return messages
  } catch {
    // sem container/serviço — usa o default
  }
  return { ...DEFAULT_MESSAGES }
}

/**
 * Opções do renderer Inertia/React.
 */
export interface InertiaRendererOptions {
  /**
   * Prefixo das páginas no diretório `inertia/pages/` do host.
   * Ex.: `'authkit'` → a view `login` mapeia para `inertia/pages/authkit/login.tsx`.
   */
  prefix: string

  /**
   * Lista de nomes de view que o host criou como páginas React (allowlist).
   *
   * Quando fornecida, **somente** as views listadas passam pelo Inertia; qualquer
   * outra view (não listada, ou prefixada com `admin/`) recai silenciosamente no
   * renderer Edge built-in da lib — sem erro 500.
   *
   * ### ⚠️ Atenção: sem `views`, qualquer tela nova da lib quebra hosts SSR
   *
   * Se `views` for omitido, o comportamento legado é preservado (todas as views
   * são enviadas ao Inertia) para compatibilidade retroativa. Nesse modo, qualquer
   * tela nova adicionada pela lib gerará um erro SSR no host ("Cannot read
   * properties of undefined (reading 'default')") porque o host não terá criado a
   * página React correspondente. **Recomenda-se sempre fornecer `views`** com
   * exatamente as páginas que o scaffold (`node ace configure`) gerou.
   *
   * A ordem do array é irrelevante — `views` é tratado como um *conjunto*
   * (allowlist). Os nomes têm autocomplete via {@link AuthkitScreen}.
   *
   * @example
   * // Gera `inertia/pages/authkit/<view>.tsx` para cada nome listado.
   * render: inertiaRenderer({
   *   prefix: 'authkit',
   *   views: [
   *     'login', 'consent', 'signup', 'forgot', 'reset',
   *     'verify-email', 'mfa-challenge',
   *     'account/login', 'account/tokens', 'account/mfa',
   *   ],
   * })
   */
  views?: AuthkitScreen[]
}

/**
 * Nomes das telas conhecidas da lib — dá autocomplete no array `views`.
 * O `(string & {})` mantém o tipo aberto: telas custom (ou de versões mais
 * novas da lib) continuam aceitas sem erro de compilação.
 */
export type AuthkitScreen =
  | 'login'
  | 'signup'
  | 'consent'
  | 'forgot'
  | 'reset'
  | 'verify-email'
  | 'mfa-challenge'
  | 'otp-unlock'
  | 'maintenance'
  | 'account/login'
  | 'account/tokens'
  | 'account/mfa'
  | 'account/security'
  | 'account/apps'
  | 'account/orgs'
  | 'account/confirm'
  | 'account/email-confirmed'
  | (string & {})

/**
 * Renderer do seam para hosts Inertia/React.
 *
 * As páginas React vivem no host em `inertia/pages/<prefix>/<view>`.
 * (O console admin não passa por aqui: é a SPA self-contained da lib,
 * servida pelo shell controller.)
 *
 * Quando `views` é fornecido (allowlist), apenas as views listadas vão ao Inertia;
 * qualquer outra view recai no Edge renderer built-in sem erro.
 *
 * ---
 *
 * ### Props da tela `account/login`
 *
 * | Prop        | Tipo                | Descrição |
 * |-------------|---------------------|-----------|
 * | `csrfToken` | `string`            | Token CSRF para o campo `_csrf` do formulário. |
 * | `returnTo`  | `string \| null`    | Caminho interno de destino pós-login (já validado pelo servidor — só caminhos internos). Quando presente, o formulário deve incluir `<input type="hidden" name="return_to" value={returnTo} />`. O servidor revalida o valor no POST; hosts com tela custom precisam propagar esse hidden input. |
 * | `error`     | `string \| undefined` | Mensagem de erro de autenticação localizada (credenciais inválidas, conta bloqueada, etc.). |
 * | `messages`  | `AuthMessages`      | Catálogo de mensagens i18n. |
 *
 * ### Props da tela `account/security`
 *
 * | Prop                    | Tipo                | Descrição |
 * |-------------------------|---------------------|-----------|
 * | `csrfToken`             | `string`            | Token CSRF para os formulários da tela. |
 * | `supported`             | `boolean`           | `false` quando o store não suporta o self-service de segurança (troca de senha/e-mail) — a tela deve degradar. |
 * | `profileSupported`      | `boolean`           | `true` quando o store suporta editar nome/avatar (`updateProfile`). |
 * | `avatarUploadSupported` | `boolean`           | `true` quando algum backend (drive OU media) pode armazenar o upload de avatar. |
 * | `email`                 | `string`            | E-mail atual da conta (`''` se ausente). |
 * | `name`                  | `string`            | Nome atual da conta (`''` se ausente). |
 * | `avatarUrl`             | `string`            | URL do avatar atual (`''` se ausente). |
 * | `passwordChanged`       | `string \| null`    | Flash de sucesso da troca de senha (mensagem localizada) ou `null`. |
 * | `emailChangeRequested`  | `string \| null`    | Flash: link de confirmação de troca de e-mail enviado (ou cancelamento) ou `null`. |
 * | `emailChanged`          | `string \| null`    | Flash: troca de e-mail concluída ou `null`. |
 * | `profileUpdated`        | `string \| null`    | Flash: perfil atualizado ou `null`. |
 * | `error`                 | `string \| null`    | Flash de erro de segurança (senha inválida, e-mail em uso, política violada) ou `null`. |
 * | `trustedDevicesEnabled` | `boolean`           | `true` quando o recurso de dispositivos confiáveis está ligado. |
 * | `trustedDevicesRevoked` | `string \| null`    | Flash: confiança deste navegador revogada ou `null`. |
 * | `sessionsSupported`     | `boolean`           | `true` quando o adapter OIDC enumera as sessões ativas da conta. |
 * | `sessions`              | `Array<{ loginTs: string; browser: string; os: string; ip: string; location: string }>` | Sessões ativas da própria conta (vazio quando não suportado). `loginTs` é ISO ou `''`. |
 * | `exportSupported`       | `boolean`           | Sempre `true` — export de dados (portabilidade/LGPD) disponível para a conta logada. |
 * | `deletionSupported`     | `boolean`           | `true` quando o store suporta hard delete (danger zone). |
 * | `deleteError`           | `string \| null`    | Flash de erro da confirmação de deleção ou `null`. |
 * | `messages`              | `AuthMessages`      | Catálogo de mensagens i18n. |
 *
 * ### Props da tela `account/mfa`
 *
 * | Prop                | Tipo                | Descrição |
 * |---------------------|---------------------|-----------|
 * | `csrfToken`         | `string`            | Token CSRF para os formulários de enroll/confirm/disable e passkeys. |
 * | `enabled`           | `boolean`           | `true` quando o TOTP já está confirmado (habilitado) para a conta. |
 * | `recoveryCodes`     | `string[] \| null`  | Códigos de recuperação recém-gerados (exibidos UMA vez após enroll/confirm) ou `null`. |
 * | `passkeysSupported` | `boolean`           | `true` quando o store persiste credenciais WebAuthn (passkeys). |
 * | `passkeys`          | `Array<{ id: string; label?: string; createdAt: string }>` | Passkeys cadastradas (vazio quando não suportado). `id` é base64url; `createdAt` é ISO. |
 * | `messages`          | `AuthMessages`      | Catálogo de mensagens i18n. |
 *
 * ### Props da tela `account/confirm` (sudo — confirmar identidade)
 *
 * | Prop          | Tipo                | Descrição |
 * |---------------|---------------------|-----------|
 * | `csrfToken`   | `string`            | Token CSRF para o POST de cada método. |
 * | `returnTo`    | `string \| null`    | Caminho interno de destino após confirmar (validado pelo servidor) ou `null`. |
 * | `error`       | `string \| null`    | Flash de erro da última tentativa de confirmação ou `null`. |
 * | `notice`      | `string \| null`    | Flash informativo (ex.: "link de confirmação enviado") ou `null`. |
 * | `methods`     | `Array<{ id: string; labelKey: string; kind: 'form' \| 'action' \| 'redirect' \| 'webauthn'; endpoint: string; fields?: Array<{ name: string; type: 'password' \| 'text'; labelKey: string }> }>` | Métodos de sudo disponíveis para a conta. A tela renderiza por `kind`; `endpoint` é o POST de verificação (`webauthn` pede options em `${endpoint}/options`). |
 * | `preferredId` | `string \| null`    | `id` do último método usado (destaque na UI) ou `null`. |
 * | `messages`    | `AuthMessages`      | Catálogo de mensagens i18n. |
 *
 * ### Props da tela `account/email-confirmed` (terminal do link de troca de e-mail)
 *
 * | Prop       | Tipo           | Descrição |
 * |------------|----------------|-----------|
 * | `ok`       | `boolean`      | `true` quando o token era válido e o novo e-mail foi aplicado; `false` para token inválido/expirado ou store sem suporte. A tela mostra sucesso ou falha conforme o valor. |
 * | `messages` | `AuthMessages` | Catálogo de mensagens i18n. |
 */
export function inertiaRenderer(opts: InertiaRendererOptions) {
  const allowed = opts.views ? new Set(opts.views) : null

  return async (ctx: HttpContext, view: string, props: Record<string, unknown>) => {
    // Allowlist: se `views` foi fornecido e a view não está na lista,
    // usa o fallback Edge silenciosamente (evita SSR crash por página inexistente no host).
    if (allowed !== null && !allowed.has(view)) {
      return renderEdgeView(ctx, view, props)
    }

    // Happy path: view vai ao Inertia.
    // `messages` vai como shared prop para as páginas React traduzirem.
    const messages = await resolveMessagesFromCtx(ctx)
    return (ctx as any).inertia.render(`${opts.prefix}/${view}`, { ...props, messages })
  }
}
