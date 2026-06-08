import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Cofre onde o keystore (blob, possivelmente encriptado) é persistido. Ponto de
 * extensão: cofres custom implementam esta interface. `head` é um token barato de
 * detecção de mudança (mtime/etag/versão) p/ o poll de reload (Fatia C).
 */
export interface KeystoreVault {
  read(): Promise<string | null>
  write(blob: string): Promise<void>
  head?(): Promise<string | null>
}

/** Cofre em arquivo local (default; mode 0600). */
export class FileKeystoreVault implements KeystoreVault {
  constructor(private path: string) {}

  async read(): Promise<string | null> {
    return existsSync(this.path) ? readFileSync(this.path, 'utf-8') : null
  }

  async write(blob: string): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, blob.endsWith('\n') ? blob : blob + '\n', { mode: 0o600 })
  }

  async head(): Promise<string | null> {
    return existsSync(this.path) ? String(statSync(this.path).mtimeMs) : null
  }
}

/** Service do `@adonisjs/drive` resolvido lazy (peer opt-in; mesmo padrão do avatar). */
type DriveService = any
let driveServicePromise: Promise<DriveService | null> | undefined

async function loadDrive(): Promise<DriveService | null> {
  if (!driveServicePromise) {
    const specifier = '@adonisjs/drive/services/main'
    driveServicePromise = import(specifier)
      .then((m) => (m as any).default ?? null)
      .catch(() => null)
  }
  return driveServicePromise
}

/** Reaponta o loader do drive (testes). @internal */
export function __setKeystoreDriveLoaderForTests(fn: (() => Promise<DriveService | null>) | undefined): void {
  driveServicePromise = fn ? fn() : undefined
}

/**
 * Cofre num disk do `@adonisjs/drive` (S3/GCS/local). Diferente do avatar, chave é
 * crítica: se o drive não está instalado mas foi selecionado → ERRO (não degrada).
 */
export class DriveKeystoreVault implements KeystoreVault {
  constructor(
    private key: string,
    private diskName?: string
  ) {}

  private async disk(): Promise<any> {
    const drive = await loadDrive()
    if (!drive) {
      throw new Error('AuthKit keystore: driver "drive" selecionado mas @adonisjs/drive não está instalado.')
    }
    return this.diskName ? drive.use(this.diskName) : drive
  }

  async read(): Promise<string | null> {
    const disk = await this.disk()
    if (!(await disk.exists(this.key))) return null
    return disk.get(this.key)
  }

  async write(blob: string): Promise<void> {
    const disk = await this.disk()
    await disk.put(this.key, blob)
  }

  async head(): Promise<string | null> {
    const disk = await this.disk()
    try {
      const meta = await disk.getMetaData(this.key)
      return meta?.etag ?? (meta?.lastModified ? String(new Date(meta.lastModified).getTime()) : null)
    } catch {
      return null
    }
  }
}
