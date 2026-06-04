/**
 * Declaração ambiente para `oidc-provider` v9, que não inclui tipos próprios
 * e não possui `@types/oidc-provider` compatível (o pacote DefinitelyTyped
 * cobre apenas a v8). Declaramos a superfície mínima que usamos.
 */
declare module 'oidc-provider' {
  export class Provider {
    constructor(issuer: string, configuration?: Record<string, any>)
    issuer: string
    proxy: boolean
    callback(): (req: any, res: any) => void
    [key: string]: any
  }
  const _default: typeof Provider
  export default _default

  /**
   * Classes de erro OAuth/OIDC expostas pelo provider (runtime real do
   * `oidc-provider`). Declaramos a superfície mínima que usamos nos handlers
   * de grant customizados.
   */
  export const errors: {
    InvalidRequest: new (description?: string, status?: number) => Error
    InvalidGrant: new (description?: string) => Error
    InvalidClient: new (description?: string) => Error
    [key: string]: new (...args: any[]) => Error
  }
}
