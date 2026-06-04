import { generateKeyPair, exportJWK } from 'jose'
import { randomUUID } from 'node:crypto'

export type SigningAlg = 'RS256' | 'ES256' | 'PS256' | 'EdDSA'

export interface ManagedJwks {
  keys: Record<string, any>[]
}

/** Gera um JWKS privado (1 chave) pronto para `oidc-provider`. */
export async function generateJwks(alg: SigningAlg): Promise<ManagedJwks> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true })
  const jwk = (await exportJWK(privateKey)) as Record<string, any>
  jwk.use = 'sig'
  jwk.alg = alg
  jwk.kid = randomUUID()
  return { keys: [jwk] }
}
