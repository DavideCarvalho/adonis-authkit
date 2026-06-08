import vine from '@vinejs/vine'
import type { ClientInput, TokenEndpointAuthMethod } from './admin_clients_service.js'

/**
 * Validators VineJS dos recursos administrativos (Admin REST API + console admin).
 *
 * O console (B6) e a Admin REST API (R6) compartilham as MESMAS formas de input,
 * então compartilham os MESMOS validators daqui. Cada controller chama
 * `request.validateUsing(<validator>)` — um input inválido vira `E_VALIDATION_ERROR`
 * (HTTP 422) pelo handler padrão do AdonisJS, substituindo as checagens manuais
 * `request.input(...)` + 400 ad-hoc que existiam antes.
 *
 * `request.validateUsing` valida `request.all()` (body+query); para valores que
 * vêm de OUTRAS fontes (route param, ou um accountId que pode vir de query OU
 * param), chame o validator direto — `validator.validate({ ... })` — montando o
 * objeto antes (ver {@link sessionAccountValidator}). Vine valida qualquer dado,
 * não só o body.
 *
 * ── O que NÃO usa Vine (de propósito) ──────────────────────────────────────
 * Nem todo input é candidato a validator com schema. Estes ficam com leitura
 * manual de propósito (migrar seria regressão, não melhoria):
 *
 *   - **Forms Edge** (`account_orgs`, `account_confirm`, `account_session`): são
 *     POSTs de formulário de sessão que, em input ausente, REDIRECIONAM de forma
 *     graciosa (ex.: de volta p/ `/account/orgs`). O throw→422 do Vine quebraria
 *     esse fluxo (vira flash-error/redirect do handler, não o redirect desenhado).
 *   - **Blobs WebAuthn** (`response` em interaction/account_mfa/account_confirm):
 *     credential JSON opaco, parseado pela lib de WebAuthn — não tem shape de
 *     campos p/ validar.
 *   - **Flags de checkbox** (`remember`, `trustDevice`): presença booleana.
 *   - **`pat_introspection`** (`token`): endpoint RFC 7662 — token ausente/inválido
 *     responde `{ active: false }`, não 422.
 *   - **`createToken` (`name`)**: opcional com default (`'Token'`) — nada a exigir.
 *
 * Regra de bolso: use Vine onde há INPUT ESTRUTURADO de API JSON que deva ser
 * REJEITADO quando inválido (422). Form-redirect, blob opaco, flag e semântica de
 * protocolo ficam de fora.
 */

const stringArray = vine.array(vine.string().trim().minLength(1))
const authMethod = vine.enum(['client_secret_basic', 'client_secret_post', 'none'] as const)

// ─── Clients OIDC ───────────────────────────────────────────────────────────

/**
 * Input de client OIDC — serve create E update (PATCH). Tudo opcional: no create
 * o controller aplica defaults (ver {@link clientCreateInput}); no update os campos
 * ausentes (undefined) são preservados pelo `AdminClientsService.update` (merge,
 * ver {@link clientPartialInput}). `grants` é aceito como alias de `grantTypes`
 * (o DTO de saída usa `grants`).
 */
export const clientInputValidator = vine.compile(
  vine.object({
    clientId: vine.string().trim().optional(),
    redirectUris: stringArray.optional(),
    postLogoutRedirectUris: stringArray.optional(),
    grantTypes: stringArray.optional(),
    grants: stringArray.optional(),
    tokenEndpointAuthMethod: authMethod.optional(),
    backchannelLogoutUri: vine.string().trim().optional(),
    backchannelLogoutSessionRequired: vine.boolean().optional(),
  })
)

/** Forma validada de um client (saída do {@link clientInputValidator}). */
export type ClientInputFields = {
  clientId?: string
  redirectUris?: string[]
  postLogoutRedirectUris?: string[]
  grantTypes?: string[]
  grants?: string[]
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod
  backchannelLogoutUri?: string
  backchannelLogoutSessionRequired?: boolean
}

/** Mapeia o input validado para um {@link ClientInput} COMPLETO (create), com defaults. */
export function clientCreateInput(v: ClientInputFields): ClientInput {
  return {
    clientId: v.clientId?.trim() || undefined,
    redirectUris: v.redirectUris ?? [],
    postLogoutRedirectUris: v.postLogoutRedirectUris ?? [],
    grantTypes: v.grantTypes ?? v.grants ?? [],
    tokenEndpointAuthMethod: v.tokenEndpointAuthMethod ?? 'client_secret_basic',
    backchannelLogoutUri: v.backchannelLogoutUri || undefined,
    backchannelLogoutSessionRequired: v.backchannelLogoutSessionRequired,
  }
}

/**
 * Mapeia o input validado para um {@link ClientInput} PARCIAL (PATCH): só inclui
 * os campos presentes; o `AdminClientsService.update` preserva o resto via merge.
 */
export function clientPartialInput(v: ClientInputFields): Partial<ClientInput> {
  const out: Partial<ClientInput> = {}
  if (v.redirectUris !== undefined) out.redirectUris = v.redirectUris
  if (v.postLogoutRedirectUris !== undefined) out.postLogoutRedirectUris = v.postLogoutRedirectUris
  const grants = v.grantTypes ?? v.grants
  if (grants !== undefined) out.grantTypes = grants
  if (v.tokenEndpointAuthMethod !== undefined) out.tokenEndpointAuthMethod = v.tokenEndpointAuthMethod
  if (v.backchannelLogoutUri !== undefined) out.backchannelLogoutUri = v.backchannelLogoutUri.trim() || undefined
  if (v.backchannelLogoutSessionRequired !== undefined)
    out.backchannelLogoutSessionRequired = v.backchannelLogoutSessionRequired
  return out
}

// ─── Usuários ───────────────────────────────────────────────────────────────

/**
 * Criação de usuário pelo admin (API + console). E-mail obrigatório e validado;
 * nome/senha opcionais; `invite:true` cria sem senha e dispara o convite. A
 * política de senha (força, comprimento mínimo do projeto) é checada DEPOIS pelo
 * AdminUsersService.create (retorna `password_policy`); por isso aqui NÃO fixamos
 * `minLength` — seria duplicar/contornar a policy configurável do projeto.
 */
export const adminUserCreateValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    name: vine.string().trim().maxLength(255).optional(),
    password: vine.string().maxLength(255).optional(),
    invite: vine.boolean().optional(),
  })
)

/** Atualização de usuário (PATCH): roles globais e/ou perfil. Tudo opcional. */
export const adminUserUpdateValidator = vine.compile(
  vine.object({
    globalRoles: vine.array(vine.string().trim()).optional(),
    name: vine.string().trim().maxLength(255).nullable().optional(),
    avatarUrl: vine.string().trim().maxLength(2048).nullable().optional(),
  })
)

/** Substituição de roles globais no console (PATCH /users/:id/roles). */
export const adminUserRolesValidator = vine.compile(
  vine.object({
    roles: vine.array(vine.string().trim()).optional(),
  })
)

// ─── Organizações ─────────────────────────────────────────────────────────────

/** Criação de org: name, slug e ownerAccountId obrigatórios; logo opcional. */
export const orgCreateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255),
    slug: vine.string().trim().minLength(1).maxLength(255),
    ownerAccountId: vine.string().trim().minLength(1),
    logoUrl: vine.string().trim().nullable().optional(),
  })
)

/** Atualização de org (PATCH): nome e/ou logo, ambos opcionais. */
export const orgUpdateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    logoUrl: vine.string().trim().nullable().optional(),
  })
)

/** Adição de membro: accountId obrigatório; role opcional (default `member`). */
export const orgAddMemberValidator = vine.compile(
  vine.object({
    accountId: vine.string().trim().minLength(1),
    role: vine.string().trim().minLength(1).optional(),
  })
)

/** Troca de papel de membro: role obrigatório. */
export const orgMemberRoleValidator = vine.compile(
  vine.object({
    role: vine.string().trim().minLength(1),
  })
)

/** Criação de convite: e-mail obrigatório e validado; role opcional (default `member`). */
export const orgInvitationValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    role: vine.string().trim().minLength(1).optional(),
  })
)

// ─── Catálogo de roles ──────────────────────────────────────────────────────

/**
 * Criação de role no catálogo: `name` obrigatório (o formato — uppercase +
 * `ROLE_NAME_RE` — e a mensagem custom continuam no controller); `description`
 * opcional.
 */
export const roleCreateValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1),
    description: vine.string().trim().optional(),
  })
)

/** Edição de role (PATCH): só `description` (o `name` vem da rota). */
export const roleUpdateValidator = vine.compile(
  vine.object({
    description: vine.string().trim().optional(),
  })
)

// ─── Introspecção de token ──────────────────────────────────────────────────

/** `POST /tokens/verify` — token obrigatório. */
export const tokenVerifyValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
  })
)

// ─── Sessões ──────────────────────────────────────────────────────────────────

/**
 * `accountId` obrigatório — para endpoints que o recebem por query/body (ex.:
 * `POST /sessions/revoke-all?accountId=`). Como o valor pode vir de fontes
 * diferentes (query OU route param), o controller monta o objeto e valida com
 * `sessionAccountValidator.validate({ accountId })` (Vine valida qualquer dado,
 * não só o body — `request.validateUsing` é só o atalho que valida `request.all()`).
 */
export const sessionAccountValidator = vine.compile(
  vine.object({
    accountId: vine.string().trim().minLength(1),
  })
)
