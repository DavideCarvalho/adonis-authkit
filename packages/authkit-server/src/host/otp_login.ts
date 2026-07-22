/**
 * Login por OTP (código digitável) — helpers puros + máquina de estados da
 * verificação.
 *
 * ── Por que este módulo existe (e o porquê da decisão de armazenamento) ───────
 * O host passwordless já tem magic link (token de 256 bits, IMPOSSÍVEL de
 * adivinhar). O código de 6 dígitos é ADIVINHÁVEL: exige lockout dedicado +
 * throttle — segurança que não se reimplementa por host. O mesmo e-mail passa a
 * carregar LINK e CÓDIGO; os dois completam a MESMA interaction OIDC.
 *
 * ── Decisão de armazenamento (investigação registrada no código) ─────────────
 * O SPEC ranqueia três opções e manda a investigação decidir. Resultado:
 *
 *   1. (preferida no spec) Guardar `otpHash`/`otpExpiresAt`/`otpAttempts` no
 *      REGISTRO DA INTERACTION do oidc-provider — **INVIÁVEL**. O modelo
 *      `Interaction` do oidc-provider só persiste os campos listados em
 *      `IN_PAYLOAD` (`base_model.js` filtra o payload por
 *      `IN_PAYLOAD.includes(key)` no construtor; `save()` chama
 *      `getValueAndPayload`). Campos custom de topo são DESCARTADOS ao persistir.
 *      O único slot livre persistido é `lastSubmission`, dono do mecanismo
 *      `mergeWithLastSubmission` — sequestrá-lo é frágil. Ver
 *      `node_modules/oidc-provider/lib/models/interaction.js:57` e
 *      `.../base_model.js:34`.
 *
 *   2. (ESCOLHIDA) Formato composto no slot já existente do token de magic link
 *      (`passwordResetToken`, hoje `ml:<token>`). Passa a `ml2:<...>` quando o
 *      OTP está ligado. Esta opção resolve os TRÊS requisitos duros de uma vez:
 *        • **Single-use conjunto** — código e link vivem no MESMO slot da MESMA
 *          linha: consumir qualquer um limpa o slot → o outro morre junto, sem
 *          coordenação entre stores.
 *        • **Contador de tentativas persistido SEM limiter** — o contador vive
 *          DENTRO do slot. O lockout é imposto pelo próprio contador persistido
 *          (fail-CLOSED: não depende do `@adonisjs/limiter`), ao contrário do
 *          `otp_lockout.ts`, que vira no-op sem limiter — perigoso para um código
 *          curto. O throttle de rota (`authkit_otp_login`) é camada EXTRA por IP.
 *        • **TTL herdado** — a coluna `passwordResetExpiresAt` já dá validade ao
 *          link; o código carrega o próprio `codeExpMs` embutido (mais curto).
 *
 *   3. Coluna nova via ensure-schema — desnecessária (a opção 2 não exige
 *      migração), então descartada.
 *
 * ── Formato do slot (`ml2:`) ─────────────────────────────────────────────────
 *   Armazenado:  `ml2:<linkToken>:<codeHash>:<codeExpMs>:<attempts>`
 *   Na URL:      `ml2:<linkToken>`  (SÓ o token do link — o código, o hash e o
 *                contador NUNCA saem no e-mail/URL, então o atacante não tem como
 *                zerar o contador manipulando o que ele recebe).
 *
 *   • `linkToken` — 32 bytes hex; é o token do magic link (mesma força de antes).
 *   • `codeHash`  — `sha256(<uid>:<code>)` em hex, ou VAZIO quando o código foi
 *                   invalidado por lockout (o link continua válido e localizável).
 *                   Atrelar ao `uid` da interaction honra o escopo "por
 *                   interaction" do spec: um código emitido numa interaction não
 *                   verifica em outra, mesmo para o mesmo e-mail.
 *   • `codeExpMs` — epoch ms de expiração DO CÓDIGO (TTL curto, default 10 min).
 *   • `attempts`  — contador server-side de tentativas erradas (começa em 0).
 *
 * Segurança do contador: como o link e o código compartilham o slot mas o
 * LOCKOUT do código NÃO pode matar o link (spec), a invalidação por lockout zera
 * o `codeHash` (mantendo `linkToken`) em vez de limpar o slot inteiro.
 */

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Config de entrada do login por OTP (`login.otp` no config/authkit.ts). */
export interface OtpLoginConfigInput {
  /** Liga o login por código. Default: **false** (opt-in, back-compat total). */
  enabled?: boolean;
  /** Número de dígitos do código. Default: 6. Faixa aceita: 4–10. */
  digits?: number;
  /** Validade do código em minutos. Default: 10. Mínimo: 1. */
  ttlMinutes?: number;
  /** Tentativas erradas antes de invalidar o código. Default: 5. Mínimo: 1. */
  maxAttempts?: number;
}

export interface ResolvedOtpLoginConfig {
  enabled: boolean;
  digits: number;
  ttlMinutes: number;
  maxAttempts: number;
}

export const OTP_LOGIN_DEFAULTS: ResolvedOtpLoginConfig = {
  enabled: false,
  digits: 6,
  ttlMinutes: 10,
  maxAttempts: 5,
};

/** Resolve/normaliza a config `login.otp` com os defaults e limites de sanidade. */
export function resolveOtpLoginConfig(input?: OtpLoginConfigInput): ResolvedOtpLoginConfig {
  const digitsRaw = input?.digits;
  const digits =
    typeof digitsRaw === 'number' && digitsRaw >= 4 && digitsRaw <= 10
      ? Math.floor(digitsRaw)
      : OTP_LOGIN_DEFAULTS.digits;
  const ttlRaw = input?.ttlMinutes;
  const ttlMinutes =
    typeof ttlRaw === 'number' && ttlRaw >= 1 ? Math.floor(ttlRaw) : OTP_LOGIN_DEFAULTS.ttlMinutes;
  const maxRaw = input?.maxAttempts;
  const maxAttempts =
    typeof maxRaw === 'number' && maxRaw >= 1 ? Math.floor(maxRaw) : OTP_LOGIN_DEFAULTS.maxAttempts;
  return {
    enabled: input?.enabled ?? OTP_LOGIN_DEFAULTS.enabled,
    digits,
    ttlMinutes,
    maxAttempts,
  };
}

// ---------------------------------------------------------------------------
// Geração e hashing do código
// ---------------------------------------------------------------------------

/**
 * Gera um código numérico de `digits` dígitos, zero-padded, SEM viés de módulo.
 *
 * Usa `crypto.randomInt(0, 10 ** digits)` — o `randomInt` do Node faz rejection
 * sampling internamente, então a distribuição é uniforme (nada de `% 10`, que
 * enviesaria os dígitos baixos). Para `digits=6` o teto é 1_000_000, bem abaixo
 * do limite de `randomInt` (2**48).
 */
export function generateOtpCode(digits: number): string {
  const max = 10 ** digits;
  const n = randomInt(0, max);
  return String(n).padStart(digits, '0');
}

/**
 * Hash do código atrelado ao `uid` da interaction: `sha256(<uid>:<code>)` em hex.
 * Atrelar ao uid escopa o código à interaction que o emitiu.
 */
export function hashLoginOtp(uid: string, code: string): string {
  return createHash('sha256').update(`${uid}:${code}`).digest('hex');
}

/**
 * Comparação constant-time de dois digests hex de MESMO tamanho.
 *
 * `timingSafeEqual` exige buffers de tamanho igual — comprimentos diferentes
 * lançam. Por isso a guarda de tamanho vem antes (retorno `false` sem vazar
 * timing útil: o atacante não controla o tamanho do digest server-side, que é
 * sempre 64 hex de um sha256).
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Codec do slot composto `ml2:`
// ---------------------------------------------------------------------------

/** Prefixo do slot `passwordResetToken` quando o login por OTP está ativo. */
export const OTP_LOGIN_PREFIX = 'ml2:';

/** Estado decodificado do slot `ml2:`. */
export interface ParsedOtpToken {
  linkToken: string;
  /** `sha256(<uid>:<code>)` hex; vazio quando o código foi invalidado (lockout). */
  codeHash: string;
  codeExpMs: number;
  attempts: number;
}

/** Só hex minúsculo (64 chars = sha256). Guard contra metacaracteres de LIKE. */
const HEX_64 = /^[0-9a-f]{64}$/;

/** Serializa o estado do OTP no formato de slot `ml2:...`. */
export function encodeOtpToken(state: ParsedOtpToken): string {
  return `${OTP_LOGIN_PREFIX}${state.linkToken}:${state.codeHash}:${state.codeExpMs}:${state.attempts}`;
}

/**
 * Decodifica o valor ARMAZENADO no slot (`ml2:<linkToken>:<codeHash>:<exp>:<att>`).
 * Retorna `null` se não for um slot `ml2:` bem-formado.
 */
export function decodeOtpToken(value: string | null | undefined): ParsedOtpToken | null {
  if (!value || !value.startsWith(OTP_LOGIN_PREFIX)) return null;
  const rest = value.slice(OTP_LOGIN_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 4) return null;
  const [linkToken, codeHash, expStr, attStr] = parts;
  if (!HEX_64.test(linkToken)) return null;
  if (codeHash !== '' && !HEX_64.test(codeHash)) return null;
  const codeExpMs = Number(expStr);
  const attempts = Number(attStr);
  if (!Number.isFinite(codeExpMs) || !Number.isInteger(attempts) || attempts < 0) return null;
  return { linkToken, codeHash, codeExpMs, attempts };
}

/**
 * Extrai o `linkToken` de uma URL de magic link `ml2:<linkToken>` (a forma que
 * vai no e-mail, SEM o estado do código). Retorna `null` se não casar o formato
 * ou se o token não for hex de 64 (guarda contra LIKE injection na busca).
 */
export function linkTokenFromOtpUrl(urlToken: string): string | null {
  if (!urlToken.startsWith(OTP_LOGIN_PREFIX)) return null;
  const linkToken = urlToken.slice(OTP_LOGIN_PREFIX.length);
  return HEX_64.test(linkToken) ? linkToken : null;
}

// ---------------------------------------------------------------------------
// Máquina de estados da verificação (PURA — testável e prova de mutação)
// ---------------------------------------------------------------------------

export type OtpVerifyOutcome = 'ok' | 'invalid' | 'locked' | 'expired' | 'no_code';

export interface OtpVerifyEvaluation {
  result: OtpVerifyOutcome;
  /**
   * O que persistir no slot `passwordResetToken` como efeito:
   *   • `undefined` — não escrever (nada mudou: expired/no_code/locked-já-travado).
   *   • `null`      — LIMPAR o slot (sucesso: mata o link junto — single-use conjunto).
   *   • string      — novo valor `ml2:` (falha: contador++ ou código invalidado).
   */
  nextToken?: string | null;
}

/**
 * Avalia UMA tentativa de código, na ORDEM travada pelo spec:
 *   lockout (contador/estado do código) → TTL do código → comparação constant-time.
 *
 * O throttle de rota e a validade da interaction são resolvidos ANTES, no
 * controller. Aqui mora só a lógica que precisa do estado persistido do código.
 *
 * IMPORTANTE (prova de mutação): a checagem de LOCKOUT é a primeira guarda. Se
 * removida, um atacante que já esgotou as tentativas volta a poder chutar — o
 * teste `remove-lockout` cobre exatamente isso.
 */
export function evaluateLoginOtp(input: {
  parsed: ParsedOtpToken | null;
  uid: string;
  code: string;
  nowMs: number;
  maxAttempts: number;
}): OtpVerifyEvaluation {
  const { parsed, uid, code, nowMs, maxAttempts } = input;

  // Sem código pendente (slot vazio, `ml:` legado ou token de reset).
  if (!parsed) return { result: 'no_code' };

  // LOCKOUT: código já invalidado (hash vazio) OU tentativas esgotadas.
  // Fail-CLOSED — imposto pelo contador PERSISTIDO, sem depender de limiter.
  if (parsed.codeHash === '' || parsed.attempts >= maxAttempts) {
    return { result: 'locked' };
  }

  // TTL do código (mais curto que o do link).
  if (parsed.codeExpMs < nowMs) return { result: 'expired' };

  // Comparação constant-time do hash atrelado ao uid.
  const candidate = hashLoginOtp(uid, code);
  if (safeEqualHex(candidate, parsed.codeHash)) {
    // Sucesso: limpa o slot → mata o magic link junto (single-use conjunto).
    return { result: 'ok', nextToken: null };
  }

  // Falha: incrementa o contador.
  const attempts = parsed.attempts + 1;
  if (attempts >= maxAttempts) {
    // Última tentativa: INVALIDA o código (zera o hash) mas PRESERVA o link.
    return { result: 'locked', nextToken: encodeOtpToken({ ...parsed, codeHash: '', attempts }) };
  }
  return { result: 'invalid', nextToken: encodeOtpToken({ ...parsed, attempts }) };
}
