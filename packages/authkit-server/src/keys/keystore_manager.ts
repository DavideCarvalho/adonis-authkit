import { generateSigningJwk, planRotation, type PersistedKeystore, type RotationPlan } from './keystore.js'
import type { KeystoreCodec } from './keystore_codec.js'
import { FileKeystoreVault, DriveKeystoreVault, type KeystoreVault } from './keystore_vault.js'
import type { SigningAlg } from './jwks_manager.js'
import type { KeystoreStoreConfig } from '@dudousxd/adonis-authkit-core'

/**
 * Único caminho de I/O do keystore managed: compõe um {@link KeystoreVault} (onde
 * o blob mora) com um {@link KeystoreCodec} (serialização + encryption). As helpers
 * puras (gerar chave, planejar rotação) continuam em `keystore.ts`.
 */
export class KeystoreManager {
  constructor(
    private vault: KeystoreVault,
    private codec: KeystoreCodec,
    private alg: SigningAlg
  ) {}

  /** Lê o keystore (privado) ou null se ausente. */
  async read(): Promise<PersistedKeystore | null> {
    const blob = await this.vault.read()
    if (blob == null) return null
    return this.codec.decode(blob)
  }

  /** Garante que exista: gera+persiste se ausente; senão decodifica e retorna. */
  async ensure(): Promise<PersistedKeystore> {
    const blob = await this.vault.read()
    if (blob == null) {
      const store: PersistedKeystore = { keys: [await generateSigningJwk(this.alg)] }
      await this.vault.write(await this.codec.encode(store))
      return store
    }
    return this.codec.decode(blob)
  }

  /** Rotaciona: chave nova na frente, mantém as `keep` mais recentes. Persiste. */
  async rotate(
    keep = 2,
    retire = false
  ): Promise<{ store: PersistedKeystore; newKid: string; retiredKids: string[] }> {
    const current = (await this.read()) ?? { keys: [] }
    const fresh = await generateSigningJwk(this.alg)
    const next = [fresh, ...current.keys]
    const effectiveKeep = retire ? 1 : Math.max(1, keep)
    const kept = next.slice(0, effectiveKeep)
    const retiredKids = next.slice(effectiveKeep).map((k) => k.kid as string)
    const store: PersistedKeystore = { keys: kept }
    await this.vault.write(await this.codec.encode(store))
    return { store, newKid: fresh.kid as string, retiredKids }
  }

  /** Plano de rotação (puro, sem I/O de escrita). */
  async plan(keep: number, retire: boolean): Promise<RotationPlan> {
    return planRotation(await this.read(), keep, retire)
  }

  /** Token barato de mudança (delegado ao vault; fallback p/ read completo). */
  async head(): Promise<string | null> {
    if (this.vault.head) return this.vault.head()
    return this.vault.read()
  }
}

/** Packages-irmãos que entregam os cofres de cloud (planos futuros). */
const CLOUD_DRIVER_PACKAGE: Record<string, string> = {
  'hashicorp-vault': '@dudousxd/adonis-authkit-vault-hashicorp',
  'aws-secrets-manager': '@dudousxd/adonis-authkit-vault-aws',
  'gcp-secret-manager': '@dudousxd/adonis-authkit-vault-gcp',
  'azure-key-vault': '@dudousxd/adonis-authkit-vault-azure',
}

/**
 * Resolve a config `store` num {@link KeystoreVault}. `makePath` = `app.makePath`
 * (resolve paths relativos à raiz do app). Instância custom (com `read`/`write`)
 * passa direto. Drivers de cloud lançam nesta fatia (chegam nos packages-irmãos).
 */
export function resolveKeystoreVault(
  store: KeystoreStoreConfig | KeystoreVault,
  makePath: (p: string) => string
): KeystoreVault {
  if (typeof store === 'string') return new FileKeystoreVault(makePath(store))
  if (typeof (store as KeystoreVault).read === 'function') return store as KeystoreVault
  const cfg = store as Exclude<KeystoreStoreConfig, string>
  switch (cfg.driver) {
    case 'file':
      return new FileKeystoreVault(makePath(cfg.path))
    case 'drive':
      return new DriveKeystoreVault(cfg.key, cfg.disk)
    default: {
      const pkg = CLOUD_DRIVER_PACKAGE[(cfg as any).driver]
      throw new Error(
        `AuthKit keystore: driver "${(cfg as any).driver}" requer o package ${pkg ?? '(desconhecido)'} ` +
          `(ainda não disponível nesta versão).`
      )
    }
  }
}
