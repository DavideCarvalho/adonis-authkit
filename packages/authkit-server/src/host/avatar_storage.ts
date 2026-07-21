import type { HttpContext } from '@adonisjs/core/http';
import type { ResolvedUploadsConfig } from '../define_config.js';

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
type DriveService = any;

let driveServicePromise: Promise<DriveService | null> | undefined;

/**
 * Importa o service de drive do HOST de forma preguiçosa e fail-safe.
 * Se `@adonisjs/drive` não estiver instalado, resolve `null`.
 */
async function loadDrive(): Promise<DriveService | null> {
  if (!driveServicePromise) {
    // Indireção via variável: o `@adonisjs/drive` é peer/opcional e pode não estar
    // instalado na lib, então o specifier não é resolvido em build-time.
    const specifier = '@adonisjs/drive/services/main';
    driveServicePromise = import(specifier)
      .then((mod) => (mod as any).default ?? null)
      .catch(() => null);
  }
  return driveServicePromise;
}

/**
 * Permite reapontar/limpar o loader do drive (usado em testes).
 * @internal
 */
export function __setDriveLoaderForTests(
  fn: (() => Promise<DriveService | null>) | undefined,
): void {
  if (fn) {
    driveServicePromise = fn();
  } else {
    driveServicePromise = undefined;
  }
}

/**
 * Módulo `@adonis-agora/media/single-file` resolvido de forma preguiçosa. Tipado
 * como `any` de propósito: a lib NÃO depende do media em tempo de compilação
 * (peer/opt-in). Expõe `storeSingleFile`/`removeSingleFile`/`isSingleFileStoreAvailable`.
 */
type MediaModule = any;

let mediaModulePromise: Promise<MediaModule | null> | undefined;

/**
 * Importa o helper single-file do `@adonis-agora/media` de forma preguiçosa e
 * fail-safe. Espelha {@link loadDrive}: se o pacote não estiver instalado, resolve
 * `null` (o specifier é indireto para não ser resolvido em build-time — peer opcional).
 */
async function loadMedia(): Promise<MediaModule | null> {
  if (!mediaModulePromise) {
    const specifier = '@adonis-agora/media/single-file';
    mediaModulePromise = import(specifier).then((mod) => (mod as any) ?? null).catch(() => null);
  }
  return mediaModulePromise;
}

/**
 * Permite reapontar/limpar o loader do media (usado em testes). Espelha
 * {@link __setDriveLoaderForTests}.
 * @internal
 */
export function __setMediaLoaderForTests(
  fn: (() => Promise<MediaModule | null>) | undefined,
): void {
  if (fn) {
    mediaModulePromise = fn();
  } else {
    mediaModulePromise = undefined;
  }
}

/** Extensões aceitas para o avatar (imagem raster comum). */
const ALLOWED_EXTNAMES = ['jpg', 'jpeg', 'png', 'webp'] as const;

/** MIME por extensão validada — fallback quando o file de multipart não traz `type`. */
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Erro de validação do upload (mensagem já localizada no controller). */
export class AvatarUploadError extends Error {
  constructor(
    public reason: 'extname' | 'size',
    message: string,
  ) {
    super(message);
    this.name = 'AvatarUploadError';
  }
}

/** File de multipart mínimo que precisamos do `request.file('avatar')`. */
export interface UploadedAvatar {
  extname?: string | null;
  size?: number;
  /** MIME reportado pelo multipart (ex.: 'image/png'). Usado pelo backend media. */
  type?: string | null;
  /** Caminho temporário (drive lê daqui para stream; media lê os bytes daqui). */
  tmpPath?: string | null;
  /** Move o arquivo para um disk do drive (API v3+). */
  moveToDisk?: (key: string, options?: { disk?: string }) => Promise<void>;
}

/**
 * Indica se o drive do app está disponível (para a view decidir mostrar o input
 * de arquivo). Best-effort: nunca lança.
 */
export async function isDriveAvailable(): Promise<boolean> {
  return (await loadDrive()) !== null;
}

/**
 * Resolve a extensão validada do arquivo enviado.
 * Lança {@link AvatarUploadError} se ext/size forem inválidos.
 */
function validate(
  file: UploadedAvatar,
  cfg: ResolvedUploadsConfig,
  messages: { extname: string; size: string },
): string {
  const ext = (file.extname ?? '').toLowerCase().replace(/^\./, '');
  if (!ALLOWED_EXTNAMES.includes(ext as (typeof ALLOWED_EXTNAMES)[number])) {
    throw new AvatarUploadError('extname', messages.extname);
  }
  const maxBytes = cfg.avatars.maxSizeMb * 1024 * 1024;
  if (typeof file.size === 'number' && file.size > maxBytes) {
    throw new AvatarUploadError('size', messages.size);
  }
  return ext;
}

/**
 * Gera uma chave única para o avatar dentro do diretório configurado.
 * `${directory}/${accountId}-${random}.${ext}`
 */
function buildKey(cfg: ResolvedUploadsConfig, accountId: string, ext: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${cfg.avatars.directory}/${accountId}-${random}.${ext}`;
}

/**
 * Backend de storage de avatar. A validação (ext/tamanho) é COMPARTILHADA em
 * {@link storeAvatar} — o uploader só armazena os bytes e devolve a URL, ou apaga.
 *
 * Dois backends resolvidos em runtime conforme `cfg.avatars.storage`:
 * - {@link builtinUploader}: o `@adonisjs/drive` do app (comportamento histórico).
 * - {@link makeMediaUploader}: o `@adonis-agora/media` (single-file collection).
 */
interface AvatarUploader {
  /** Armazena os bytes já validados e devolve a URL pública (ou `null` se degradar). */
  store(
    ctx: HttpContext,
    cfg: ResolvedUploadsConfig,
    file: UploadedAvatar,
    accountId: string,
    ext: string,
  ): Promise<string | null>;
  /** Apaga o avatar da conta (best-effort, nunca lança). */
  delete(
    cfg: ResolvedUploadsConfig,
    accountId: string | null | undefined,
    storedUrlOrKey: string | null | undefined,
  ): Promise<boolean>;
}

/**
 * Backend builtin: o `@adonisjs/drive` JÁ configurado no app. Comportamento
 * BYTE-IDÊNTICO ao histórico (moveToDisk/putStream + getUrl; delete por key
 * derivada do diretório).
 */
const builtinUploader: AvatarUploader = {
  async store(_ctx, cfg, file, accountId, ext) {
    const drive = await loadDrive();
    if (!drive) return null;

    // Resolve o disk: o configurado, ou o DEFAULT do drive do app.
    let disk: any;
    try {
      disk = cfg.avatars.disk ? drive.use(cfg.avatars.disk) : drive.use();
    } catch {
      // disk inválido/não-configurado — degrada para URL.
      return null;
    }
    if (!disk) return null;

    const key = buildKey(cfg, accountId || 'account', ext);

    // API @adonisjs/drive v3+: o file de multipart move-se direto para o disk.
    // `moveToDisk` lê do tmpPath e usa o disk informado (ou o default da config).
    if (typeof file.moveToDisk === 'function') {
      await file.moveToDisk(key, cfg.avatars.disk ? { disk: cfg.avatars.disk } : undefined);
    } else if (file.tmpPath) {
      // Fallback: lê do tmpPath e escreve via putStream no disk resolvido.
      const fs = await import('node:fs');
      await disk.putStream(key, fs.createReadStream(file.tmpPath));
    } else {
      return null;
    }

    try {
      return await disk.getUrl(key);
    } catch {
      // disk sem getUrl público — retorna a key como referência relativa.
      return key;
    }
  },

  async delete(cfg, _accountId, storedUrlOrKey) {
    if (!storedUrlOrKey) return false;
    const drive = await loadDrive();
    if (!drive) return false;

    // Deriva a key: trecho a partir de `<directory>/`. Se não bater, aborta (não
    // arriscamos deletar algo fora do nosso diretório).
    const dir = cfg.avatars.directory.replace(/\/+$/, '');
    const marker = `${dir}/`;
    const idx = storedUrlOrKey.indexOf(marker);
    if (idx < 0) return false;
    // Remove querystring/fragment de uma URL pública.
    const key = storedUrlOrKey.slice(idx).split(/[?#]/)[0];

    let disk: any;
    try {
      disk = cfg.avatars.disk ? drive.use(cfg.avatars.disk) : drive.use();
    } catch {
      return false;
    }
    if (!disk || typeof disk.delete !== 'function') return false;

    try {
      await disk.delete(key);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Backend media: delega ao `@adonis-agora/media` (collection single-file). O
 * lifecycle é keyed por owner (`ownerType`/`ownerId`) — o `single: true` da
 * collection faz o replace de slot; a URL final é o que persistimos em `avatarUrl`.
 */
function makeMediaUploader(media: MediaModule): AvatarUploader {
  return {
    async store(_ctx, cfg, file, accountId, ext) {
      if (!file.tmpPath) return null;
      const fs = await import('node:fs/promises');
      const contents = await fs.readFile(file.tmpPath);
      const fileName = `avatar.${ext}`;
      const mimeType = file.type ?? EXT_MIME[ext] ?? 'application/octet-stream';
      const result = await media.storeSingleFile({
        ownerType: cfg.avatars.ownerType,
        ownerId: accountId,
        collection: cfg.avatars.collection,
        fileName,
        mimeType,
        contents,
      });
      return result?.url ?? null;
    },

    async delete(cfg, accountId, _storedUrlOrKey) {
      // media apaga por owner (a key/URL não é usada — o lifecycle é do owner).
      if (!accountId) return false;
      try {
        await media.removeSingleFile({
          ownerType: cfg.avatars.ownerType,
          ownerId: accountId,
          collection: cfg.avatars.collection,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Resolve o backend de avatar conforme `cfg.avatars.storage`:
 * - `'builtin'` → sempre o drive (ou `null` se ausente).
 * - `'media'`   → o media (ou `null` se ausente/indisponível — degrada gracioso).
 * - `'auto'`    → media se disponível, senão o drive.
 *
 * "media disponível" = pacote presente E `isSingleFileStoreAvailable()` true (o
 * MediaManager está bindado no container do app). Nunca lança.
 */
async function resolveUploader(cfg: ResolvedUploadsConfig): Promise<AvatarUploader | null> {
  const storage = cfg.avatars.storage;

  if (storage === 'builtin') {
    return (await loadDrive()) ? builtinUploader : null;
  }

  if (storage === 'media') {
    const media = await loadMediaIfUsable();
    return media ? makeMediaUploader(media) : null;
  }

  // 'auto' (default): media se disponível, senão builtin.
  const media = await loadMediaIfUsable();
  if (media) return makeMediaUploader(media);
  return (await loadDrive()) ? builtinUploader : null;
}

/**
 * Indica se o upload de avatar está disponível para a config dada — i.e. se ALGUM
 * backend configurado consegue armazenar (mesma lógica de seleção do
 * {@link resolveUploader}: `'builtin'` → drive; `'media'` → media; `'auto'` →
 * media OU drive). Usado pelas views/controllers para decidir mostrar o input de
 * arquivo. Best-effort: nunca lança.
 *
 * Substitui o antigo gate por {@link isDriveAvailable}, que escondia o input num
 * host media-only (media presente, drive ausente) mesmo com o media capaz de armazenar.
 */
export async function isAvatarUploadSupported(cfg: ResolvedUploadsConfig): Promise<boolean> {
  return (await resolveUploader(cfg)) !== null;
}

/**
 * Carrega o módulo media só se ele estiver USÁVEL: pacote presente E
 * `isSingleFileStoreAvailable()` resolve `true`. Best-effort — qualquer erro → null.
 */
async function loadMediaIfUsable(): Promise<MediaModule | null> {
  const media = await loadMedia();
  if (!media) return null;
  try {
    return (await media.isSingleFileStoreAvailable()) ? media : null;
  } catch {
    return null;
  }
}

/**
 * Armazena o avatar no backend ativo (drive OU media) e retorna a URL pública.
 *
 * - Resolve o backend PRIMEIRO: se nenhum estiver disponível → retorna `null`
 *   (degrada para o input de URL, feature off) SEM validar/lançar. Isso preserva o
 *   comportamento histórico: um host sem backend nunca vê erro de validação.
 * - Só quando há backend valida extensão (jpg/jpeg/png/webp) e tamanho
 *   (≤ maxSizeMb) — COMPARTILHADO, antes de entregar ao backend; lança
 *   {@link AvatarUploadError} se inválido (o controller traduz/flasha).
 * - Backend conforme `cfg.avatars.storage` (ver {@link resolveUploader}).
 *
 * Nunca lança por causa de backend ausente; só lança em validação (com backend).
 */
export async function storeAvatar(
  ctx: HttpContext,
  cfg: ResolvedUploadsConfig,
  file: UploadedAvatar,
  accountId: string,
  messages: { extname: string; size: string },
): Promise<string | null> {
  const uploader = await resolveUploader(cfg);
  if (!uploader) return null;
  const ext = validate(file, cfg, messages);
  return uploader.store(ctx, cfg, file, accountId, ext);
}

/**
 * Deleta (best-effort, fail-safe) o avatar de uma conta no backend ativo. Usado
 * pela deleção de conta (LGPD). O `accountId` é o owner — necessário para o backend
 * media apagar por owner; o backend builtin deriva a key da `storedUrlOrKey`.
 *
 * NUNCA lança: backend ausente, key não reconhecida ou erro de I/O → no-op.
 */
export async function deleteAvatar(
  cfg: ResolvedUploadsConfig,
  accountId: string | null | undefined,
  storedUrlOrKey: string | null | undefined,
): Promise<boolean> {
  const uploader = await resolveUploader(cfg);
  if (!uploader) return false;
  return uploader.delete(cfg, accountId, storedUrlOrKey);
}
