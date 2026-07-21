/** Estrutura mínima compatível com o KeystoreVault do authkit-server. */
export interface KeystoreVaultLike {
  read(): Promise<string | null>;
  write(blob: string): Promise<void>;
  head?(): Promise<string | null>;
}
/** Seam injetável (get/put/version) — testável sem SDK. */
export interface SecretBackend {
  get(): Promise<string | null>;
  put(blob: string): Promise<void>;
  version?(): Promise<string | null>;
}
class ExternalSecretVault implements KeystoreVaultLike {
  constructor(private backend: SecretBackend) {}
  read() {
    return this.backend.get();
  }
  write(blob: string) {
    return this.backend.put(blob);
  }
  async head() {
    return this.backend.version ? this.backend.version() : this.backend.get();
  }
}

/** `name` no formato `projects/{p}/secrets/{s}`. */
export interface GcpVaultConfig {
  name: string;
  backend?: SecretBackend;
}

export function createKeystoreVault(cfg: GcpVaultConfig): KeystoreVaultLike {
  return new ExternalSecretVault(cfg.backend ?? makeGcpBackend(cfg));
}

function makeGcpBackend(cfg: GcpVaultConfig): SecretBackend {
  // Indireção via variável: o SDK é peer/opcional e pode não estar instalado;
  // o specifier não é resolvido em build-time pelo tsc.
  const spec = '@google-cloud/secret-manager';
  let clientP: Promise<any> | undefined;
  const client = async () => {
    if (!clientP) {
      clientP = (async () => {
        const s: any = await import(spec);
        return new s.SecretManagerServiceClient();
      })();
    }
    return clientP;
  };
  return {
    async get() {
      const c = await client();
      try {
        const [v] = await c.accessSecretVersion({ name: `${cfg.name}/versions/latest` });
        const d = v?.payload?.data;
        return d ? Buffer.from(d).toString('utf8') : null;
      } catch (e: any) {
        if (e?.code === 5) return null; // 5 = NOT_FOUND
        throw e;
      }
    },
    async put(blob) {
      const c = await client();
      await c.addSecretVersion({
        parent: cfg.name,
        payload: { data: Buffer.from(blob, 'utf8') },
      });
    },
    async version() {
      const c = await client();
      try {
        const [v] = await c.accessSecretVersion({ name: `${cfg.name}/versions/latest` });
        return v?.name ?? null;
      } catch {
        return null;
      }
    },
  };
}
