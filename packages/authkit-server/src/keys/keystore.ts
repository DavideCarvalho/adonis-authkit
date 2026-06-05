import { generateKeyPair, exportJWK } from 'jose'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SigningAlg } from './jwks_manager.js'

/**
 * Keystore JSON em arquivo para o modo `jwks: { source: 'managed', store }`.
 *
 * O modo `managed` "puro" gera UMA chave efêmera por boot (em
 * {@link generateJwks}) — não persiste, então rotacionar não faz sentido: a cada
 * restart o kid muda e tokens antigos param de validar. Para suportar rotação de
 * verdade, este keystore persiste o JWKS PRIVADO em um arquivo. A rotação gera
 * um novo par (novo kid) e mantém as N chaves mais recentes; o JWKS público
 * servido inclui todas (as antigas continuam validando), e a PRIMEIRA chave do
 * array é a de assinatura corrente (o oidc-provider assina com a primeira chave
 * compatível).
 */

/** Estrutura persistida: JWKS privado (chaves com `d`). */
export interface PersistedKeystore {
  keys: Record<string, any>[]
}

/** Gera uma chave de assinatura privada como JWK (com use/alg/kid). */
export async function generateSigningJwk(alg: SigningAlg): Promise<Record<string, any>> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true })
  const jwk = (await exportJWK(privateKey)) as Record<string, any>
  jwk.use = 'sig'
  jwk.alg = alg
  jwk.kid = randomUUID()
  return jwk
}

/** Lê o keystore do arquivo, ou null se não existir/for inválido. */
export function readKeystore(path: string): PersistedKeystore | null {
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    if (parsed && Array.isArray(parsed.keys)) return parsed
    return null
  } catch {
    return null
  }
}

/** Escreve o keystore no arquivo (cria o diretório se preciso). */
export function writeKeystore(path: string, store: PersistedKeystore): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 })
}

/**
 * Garante que o keystore exista: se ausente, cria com uma chave nova e persiste.
 * Retorna o keystore (privado).
 */
export async function ensureKeystore(path: string, alg: SigningAlg): Promise<PersistedKeystore> {
  const existing = readKeystore(path)
  if (existing && existing.keys.length > 0) return existing
  const store: PersistedKeystore = { keys: [await generateSigningJwk(alg)] }
  writeKeystore(path, store)
  return store
}

/**
 * Rotaciona o keystore: gera uma chave nova, coloca-a NA FRENTE (vira a chave de
 * assinatura corrente) e mantém apenas as `keep` mais recentes (default 2) para
 * que tokens assinados com a chave anterior continuem validando. Persiste e
 * retorna o keystore atualizado.
 */
export async function rotateKeystore(
  path: string,
  alg: SigningAlg,
  keep = 2
): Promise<{ store: PersistedKeystore; newKid: string; retiredKids: string[] }> {
  const current = readKeystore(path) ?? { keys: [] }
  const fresh = await generateSigningJwk(alg)
  const next = [fresh, ...current.keys]
  const kept = next.slice(0, Math.max(1, keep))
  const retiredKids = next.slice(Math.max(1, keep)).map((k) => k.kid)
  const store: PersistedKeystore = { keys: kept }
  writeKeystore(path, store)
  return { store, newKid: fresh.kid, retiredKids }
}

/** Deriva o JWKS PÚBLICO (sem `d` e demais campos privados) a partir do privado. */
export function toPublicJwks(store: PersistedKeystore): { keys: Record<string, any>[] } {
  const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi']
  return {
    keys: store.keys.map((jwk) => {
      const pub: Record<string, any> = {}
      for (const [k, v] of Object.entries(jwk)) {
        if (!PRIVATE_FIELDS.includes(k)) pub[k] = v
      }
      return pub
    }),
  }
}
