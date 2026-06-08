import { generateSigningJwk, planRotation, type PersistedKeystore, type RotationPlan } from './keystore.js'
import type { KeystoreCodec } from './keystore_codec.js'
import type { KeystoreVault } from './keystore_vault.js'
import type { SigningAlg } from './jwks_manager.js'

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
