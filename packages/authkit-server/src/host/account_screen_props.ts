/**
 * Tipos de props das telas do console de conta (`/account/*`) — a FONTE ÚNICA da
 * verdade sobre o shape que cada página React recebe.
 *
 * ── Por que esses tipos existem ──────────────────────────────────────────────
 * Um host que cria as telas do console em React próprio (via `inertiaRenderer`,
 * em vez das views Edge built-in) precisa tipar o componente da página. Antes
 * disso, o único "contrato" era o DOCBLOCK do `inertiaRenderer`, copiado à mão —
 * frágil: um docblock desatualizado já enganou um host. Agora o shape vem daqui,
 * e os CONTROLLERS REAIS (`account_session_controller`, `account_security_-
 * controller`, `account_mfa_controller`, `account_confirm_controller`) satisfazem
 * (`satisfies Omit<…, 'messages'>`) exatamente estes tipos ao chamar `render()`.
 * Se o payload de um controller divergir do tipo — campo a mais, a menos, tipo
 * trocado — o `tsc` do pacote quebra. Esse é o objetivo: um único ponto muda, e
 * o compilador força o outro a acompanhar.
 *
 * ── Sobre a prop `messages` ──────────────────────────────────────────────────
 * `messages` (catálogo i18n) é injetada pelo `inertiaRenderer` como shared prop,
 * NÃO pelos controllers. Por isso ela faz parte destes tipos (é o que a página
 * React recebe), mas os controllers satisfazem `Omit<…, 'messages'>` — eles nunca
 * passam `messages` no literal do `render()`.
 */

import type { PasskeySummary } from '../accounts/account_store.js';
import type { AuthMessages } from './i18n.js';
import type { SudoMethodDescriptor } from './sudo/types.js';

/**
 * Props da tela `account/login` (tela de login do console de conta).
 *
 * - `csrfToken`: token para o campo `_csrf` do formulário.
 * - `returnTo`: caminho interno de destino pós-login (já validado pelo servidor —
 *   só caminhos internos) ou `null`. Quando presente, o formulário deve incluir
 *   `<input type="hidden" name="return_to" value={returnTo} />`; o servidor
 *   revalida no POST.
 * - `error`: mensagem de erro de autenticação localizada (credenciais inválidas,
 *   conta bloqueada/desabilitada). Ausente quando não há erro.
 * - `messages`: catálogo i18n (injetado pelo renderer).
 */
export interface AccountLoginProps {
  csrfToken: string;
  returnTo: string | null;
  error?: string;
  messages: AuthMessages;
}

/**
 * Props da tela `account/security` (perfil, senha, e-mail, sessões, export,
 * danger-zone). Todas as flags de `*Supported` degradam a UI quando o store não
 * suporta a capacidade correspondente.
 *
 * - `supported`: `false` quando o store não suporta o self-service de segurança.
 * - `profileSupported`: `true` quando dá para editar nome/avatar (`updateProfile`).
 * - `avatarUploadSupported`: `true` quando algum backend (drive OU media) armazena o upload.
 * - `email` / `name` / `avatarUrl`: valores atuais da conta (`''` se ausentes).
 * - `passwordChanged` / `emailChangeRequested` / `emailChanged` / `profileUpdated`
 *   / `error` / `trustedDevicesRevoked` / `deleteError`: flashes localizados ou `null`.
 * - `trustedDevicesEnabled`: recurso de dispositivos confiáveis ligado.
 * - `sessionsSupported`: `true` quando o adapter OIDC enumera as sessões ativas.
 * - `sessions`: sessões ativas da própria conta (vazio quando não suportado).
 *   `loginTs` é ISO ou `''`.
 * - `exportSupported`: sempre `true` (portabilidade/LGPD para a conta logada).
 * - `deletionSupported`: `true` quando o store suporta hard delete.
 * - `messages`: catálogo i18n (injetado pelo renderer).
 */
export interface AccountSecurityProps {
  csrfToken: string;
  supported: boolean;
  profileSupported: boolean;
  avatarUploadSupported: boolean;
  email: string;
  name: string;
  avatarUrl: string;
  passwordChanged: string | null;
  emailChangeRequested: string | null;
  emailChanged: string | null;
  profileUpdated: string | null;
  error: string | null;
  trustedDevicesEnabled: boolean;
  trustedDevicesRevoked: string | null;
  sessionsSupported: boolean;
  sessions: Array<{
    loginTs: string;
    browser: string;
    os: string;
    ip: string;
    location: string;
  }>;
  exportSupported: boolean;
  deletionSupported: boolean;
  deleteError: string | null;
  messages: AuthMessages;
}

/**
 * Props da tela `account/mfa` (TOTP + passkeys). As props VARIAM por action, e é
 * por isso que as específicas de passo são opcionais:
 *
 * - `index` manda o estado base + a lista de passkeys (`passkeysSupported` /
 *   `passkeys`).
 * - `enroll` (após `POST /mfa/enroll`) acrescenta o passo do QR: `enrolling: true`,
 *   `secret` (base32 para entrada manual) e `qrDataUrl` (data-URL do `otpauth://`).
 * - `confirm` com código inválido reexibe `enrolling: true` + `error`, com
 *   `secret`/`qrDataUrl` `null` (o segredo pendente NÃO é regenerado).
 *
 * - `enabled`: `true` quando o TOTP já está confirmado.
 * - `recoveryCodes`: códigos recém-gerados (exibidos UMA vez) ou `null`.
 * - `messages`: catálogo i18n (injetado pelo renderer).
 */
export interface AccountMfaProps {
  csrfToken: string;
  enabled: boolean;
  recoveryCodes: string[] | null;
  /** Presente em `index`: `true` quando o store persiste credenciais WebAuthn. */
  passkeysSupported?: boolean;
  /** Presente em `index`: passkeys cadastradas (vazio quando não suportado). */
  passkeys?: PasskeySummary[];
  /** Passo de enroll/confirm: `true` mostra QR/segredo + campo de código. */
  enrolling?: boolean;
  /** Segredo TOTP (base32) no passo de enroll; `null` na reexibição do confirm. */
  secret?: string | null;
  /** QR do `otpauth://` como data-URL no passo de enroll; `null` na reexibição. */
  qrDataUrl?: string | null;
  /** Erro localizado (ex.: código TOTP inválido no confirm). */
  error?: string;
  messages: AuthMessages;
}

/**
 * Um método de sudo, como a tela `account/confirm` o recebe: o descritor do SPI
 * (`SudoMethodDescriptor`) acrescido do `id` estável do método. A tela renderiza
 * por `kind` (`form`/`action`/`redirect`/`webauthn`); `endpoint` é o POST de
 * verificação (para `webauthn`, as options ficam em `${endpoint}/options`).
 */
export type AccountConfirmMethod = { id: string } & SudoMethodDescriptor;

/**
 * Props da tela `account/confirm` (sudo — confirmar identidade).
 *
 * - `csrfToken`: token para o POST de cada método.
 * - `returnTo`: caminho interno de destino após confirmar (validado) ou `null`.
 * - `error`: flash de erro da última tentativa ou `null`.
 * - `notice`: flash informativo (ex.: "link de confirmação enviado") ou `null`.
 * - `methods`: métodos de sudo disponíveis para a conta (ver {@link AccountConfirmMethod}).
 * - `preferredId`: `id` do último método usado (destaque na UI) ou `null`.
 * - `messages`: catálogo i18n (injetado pelo renderer).
 */
export interface AccountConfirmProps {
  csrfToken: string;
  returnTo: string | null;
  error: string | null;
  notice: string | null;
  methods: AccountConfirmMethod[];
  preferredId: string | null;
  messages: AuthMessages;
}

/**
 * Props da tela `account/email-confirmed` (terminal do link de troca de e-mail).
 *
 * - `ok`: `true` quando o token era válido e o novo e-mail foi aplicado; `false`
 *   para token inválido/expirado ou store sem suporte.
 * - `messages`: catálogo i18n (injetado pelo renderer).
 */
export interface AccountEmailConfirmedProps {
  ok: boolean;
  messages: AuthMessages;
}
