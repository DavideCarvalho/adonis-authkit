import type { HttpContext } from '@adonisjs/core/http'
import type { ResolvedUploadsConfig } from '../define_config.js'

/**
 * Upload de avatar do host-kit usando o `@adonisjs/drive` JÁ configurado no app.
 * Mesmo princípio do default_mailer/rate_limit: por padrão usamos a infra do
 * host (o disk DEFAULT do drive do app), sem o dev precisar escrever nada; tudo
 * é sobreponível via `config/authkit.ts` (`uploads.avatars`).
 *
 * Best-effort / fail-safe: se `@adonisjs/drive` não estiver instalado/configurado,
 * {@link storeAvatar} retorna `null` e a feature degrada para o input de URL.
 * Nunca lança na request por causa de drive ausente.
 */

/**
 * Service do `@adonisjs/drive` resolvido de forma preguiçosa. Tipado como `any` de
 * propósito: a lib NÃO depende do drive em tempo de compilação (peer/opt-in).
 */
type DriveService = any

let driveServicePromise: Promise<DriveService | null> | undefined

/**
 * Importa o service de drive do HOST de forma preguiçosa e fail-safe.
 * Se `@adonisjs/drive` não estiver instalado, resolve `null`.
 */
async function loadDrive(): Promise<DriveService | null> {
  if (!driveServicePromise) {
    // Indireção via variável: o `@adonisjs/drive` é peer/opcional e pode não estar
    // instalado na lib, então o specifier não é resolvido em build-time.
    const specifier = '@adonisjs/drive/services/main'
    driveServicePromise = import(specifier)
      .then((mod) => (mod as any).default ?? null)
      .catch(() => null)
  }
  return driveServicePromise
}

/**
 * Permite reapontar/limpar o loader do drive (usado em testes).
 * @internal
 */
export function __setDriveLoaderForTests(
  fn: (() => Promise<DriveService | null>) | undefined
): void {
  if (fn) {
    driveServicePromise = fn()
  } else {
    driveServicePromise = undefined
  }
}

/** Extensões aceitas para o avatar (imagem raster comum). */
const ALLOWED_EXTNAMES = ['jpg', 'jpeg', 'png', 'webp'] as const

/** Erro de validação do upload (mensagem já localizada no controller). */
export class AvatarUploadError extends Error {
  constructor(
    public reason: 'extname' | 'size',
    message: string
  ) {
    super(message)
    this.name = 'AvatarUploadError'
  }
}

/** File de multipart mínimo que precisamos do `request.file('avatar')`. */
export interface UploadedAvatar {
  extname?: string | null
  size?: number
  /** Caminho temporário (drive lê daqui para stream). */
  tmpPath?: string | null
  /** Move o arquivo para um disk do drive (API v3+). */
  moveToDisk?: (key: string, options?: { disk?: string }) => Promise<void>
}

/**
 * Indica se o drive do app está disponível (para a view decidir mostrar o input
 * de arquivo). Best-effort: nunca lança.
 */
export async function isDriveAvailable(): Promise<boolean> {
  return (await loadDrive()) !== null
}

/**
 * Resolve a extensão validada do arquivo enviado.
 * Lança {@link AvatarUploadError} se ext/size forem inválidos.
 */
function validate(
  file: UploadedAvatar,
  cfg: ResolvedUploadsConfig,
  messages: { extname: string; size: string }
): string {
  const ext = (file.extname ?? '').toLowerCase().replace(/^\./, '')
  if (!ALLOWED_EXTNAMES.includes(ext as (typeof ALLOWED_EXTNAMES)[number])) {
    throw new AvatarUploadError('extname', messages.extname)
  }
  const maxBytes = cfg.avatars.maxSizeMb * 1024 * 1024
  if (typeof file.size === 'number' && file.size > maxBytes) {
    throw new AvatarUploadError('size', messages.size)
  }
  return ext
}

/**
 * Gera uma chave única para o avatar dentro do diretório configurado.
 * `${directory}/${accountId}-${random}.${ext}`
 */
function buildKey(cfg: ResolvedUploadsConfig, accountId: string, ext: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${cfg.avatars.directory}/${accountId}-${random}.${ext}`
}

/**
 * Armazena o avatar no drive do host e retorna a URL pública.
 *
 * - Valida extensão (jpg/jpeg/png/webp) e tamanho (≤ maxSizeMb) — lança
 *   {@link AvatarUploadError} se inválido (o controller traduz/flasha).
 * - Usa o disk configurado em `uploads.avatars.disk` ou o disk DEFAULT do app.
 * - Se o drive estiver ausente/não-configurado → retorna `null` (degrada para URL).
 *
 * Nunca lança por causa de drive ausente; só lança em validação.
 */
export async function storeAvatar(
  _ctx: HttpContext,
  cfg: ResolvedUploadsConfig,
  file: UploadedAvatar,
  accountId: string,
  messages: { extname: string; size: string }
): Promise<string | null> {
  const drive = await loadDrive()
  if (!drive) return null

  const ext = validate(file, cfg, messages)

  // Resolve o disk: o configurado, ou o DEFAULT do drive do app.
  let disk: any
  try {
    disk = cfg.avatars.disk ? drive.use(cfg.avatars.disk) : drive.use()
  } catch {
    // disk inválido/não-configurado — degrada para URL.
    return null
  }
  if (!disk) return null

  const key = buildKey(cfg, accountId || 'account', ext)

  // API @adonisjs/drive v3+: o file de multipart move-se direto para o disk.
  // `moveToDisk` lê do tmpPath e usa o disk informado (ou o default da config).
  if (typeof file.moveToDisk === 'function') {
    await file.moveToDisk(key, cfg.avatars.disk ? { disk: cfg.avatars.disk } : undefined)
  } else if (file.tmpPath) {
    // Fallback: lê do tmpPath e escreve via putStream no disk resolvido.
    const fs = await import('node:fs')
    await disk.putStream(key, fs.createReadStream(file.tmpPath))
  } else {
    return null
  }

  try {
    return await disk.getUrl(key)
  } catch {
    // disk sem getUrl público — retorna a key como referência relativa.
    return key
  }
}
