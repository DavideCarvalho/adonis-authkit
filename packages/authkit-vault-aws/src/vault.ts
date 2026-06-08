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

export interface AwsVaultConfig {
  secretId: string
  region?: string
  backend?: SecretBackend
}

export function createKeystoreVault(cfg: AwsVaultConfig): KeystoreVaultLike {
  return new ExternalSecretVault(cfg.backend ?? makeAwsBackend(cfg))
}

function makeAwsBackend(cfg: AwsVaultConfig): SecretBackend {
  // Indireção via variável: o SDK é peer/opcional e pode não estar instalado;
  // o specifier não é resolvido em build-time pelo tsc.
  const spec = '@aws-sdk/client-secrets-manager'
  let sdkP: Promise<any> | undefined
  let clientP: Promise<any> | undefined
  const sdk = () => (sdkP ??= import(spec))
  const client = async () =>
    (clientP ??= (async () => {
      const s: any = await sdk()
      return new s.SecretsManagerClient(cfg.region ? { region: cfg.region } : {})
    })())
  return {
    async get() {
      const s: any = await sdk()
      const c = await client()
      try {
        const r = await c.send(new s.GetSecretValueCommand({ SecretId: cfg.secretId }))
        return r.SecretString ?? null
      } catch (e: any) {
        if (e?.name === 'ResourceNotFoundException') return null
        throw e
      }
    },
    async put(blob) {
      const s: any = await sdk()
      const c = await client()
      try {
        await c.send(new s.PutSecretValueCommand({ SecretId: cfg.secretId, SecretString: blob }))
      } catch (e: any) {
        if (e?.name === 'ResourceNotFoundException')
          await c.send(new s.CreateSecretCommand({ Name: cfg.secretId, SecretString: blob }))
        else throw e
      }
    },
    async version() {
      const s: any = await sdk()
      const c = await client()
      try {
        const r = await c.send(new s.GetSecretValueCommand({ SecretId: cfg.secretId }))
        return r.VersionId ?? null
      } catch {
        return null
      }
    },
  }
}
