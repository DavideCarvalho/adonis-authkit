/** Estrutura mínima compatível com o KeystoreVault do authkit-server. */
export interface KeystoreVaultLike {
  read(): Promise<string | null>
  write(blob: string): Promise<void>
  head?(): Promise<string | null>
}
/** Seam injetável (get/put/version) — testável sem SDK. */
export interface SecretBackend {
  get(): Promise<string | null>
  put(blob: string): Promise<void>
  version?(): Promise<string | null>
}
class ExternalSecretVault implements KeystoreVaultLike {
  constructor(private backend: SecretBackend) {}
  read() {
    return this.backend.get()
  }
  write(blob: string) {
    return this.backend.put(blob)
  }
  async head() {
    return this.backend.version ? this.backend.version() : this.backend.get()
  }
}

export interface AzureVaultConfig {
  vaultUrl: string
  secretName: string
  backend?: SecretBackend
}

export function createKeystoreVault(cfg: AzureVaultConfig): KeystoreVaultLike {
  return new ExternalSecretVault(cfg.backend ?? makeAzureBackend(cfg))
}

function makeAzureBackend(cfg: AzureVaultConfig): SecretBackend {
  // Indireção via variável: os SDKs são peer/opcionais e podem não estar instalados;
  // os specifiers não são resolvidos em build-time pelo tsc.
  const kvSpec = '@azure/keyvault-secrets'
  const idSpec = '@azure/identity'
  let clientP: Promise<any> | undefined
  const client = async () =>
    (clientP ??= (async () => {
      const kv: any = await import(kvSpec)
      const id: any = await import(idSpec)
      return new kv.SecretClient(cfg.vaultUrl, new id.DefaultAzureCredential())
    })())
  return {
    async get() {
      const c = await client()
      try {
        const s = await c.getSecret(cfg.secretName)
        return s?.value ?? null
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.code === 'SecretNotFound') return null
        throw e
      }
    },
    async put(blob) {
      const c = await client()
      await c.setSecret(cfg.secretName, blob)
    },
    async version() {
      const c = await client()
      try {
        const s = await c.getSecret(cfg.secretName)
        return s?.properties?.version ?? null
      } catch {
        return null
      }
    },
  }
}
