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

/** Gera uma chave de assinatura privada como JWK (com use/alg/kid + carimbo de criação). */
export async function generateSigningJwk(alg: SigningAlg): Promise<Record<string, any>> {
  const { privateKey } = await generateKeyPair(alg, { extractable: true })
  const jwk = (await exportJWK(privateKey)) as Record<string, any>
  jwk.use = 'sig'
  jwk.alg = alg
  jwk.kid = randomUUID()
  // Metadado NÃO-padrão usado só para reportar idade da chave (doctor / rotação).
  // O oidc-provider e o JWKS público ignoram campos desconhecidos; `toPublicJwks`
  // remove apenas a parte privada — `iat` continua interno, não vaza nada sensível.
  jwk.iat = Math.floor(Date.now() / 1000)
  return jwk
}

/** Idade (em dias) da chave de assinatura corrente (primeira do keystore), ou null. */
export function signingKeyAgeDays(store: PersistedKeystore | null): number | null {
  const iat = store?.keys?.[0]?.iat
  if (typeof iat !== 'number') return null
  return Math.max(0, Math.floor((Date.now() / 1000 - iat) / 86400))
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

/** Plano de uma rotação — o que SERIA feito (dry-run) sem tocar disco. */
export interface RotationPlan {
  /** kid da chave de assinatura corrente (será deslocada para verificação), ou null. */
  currentKid: string | null
  /** kids que permanecem no JWKS público após a rotação (a nova vem primeiro). */
  keptKids: string[]
  /** kids removidos do JWKS (tokens assinados por eles deixam de validar). */
  retiredKids: string[]
  /** Quantas chaves o keystore mantém após a rotação. */
  keep: number
}

/**
 * Calcula o plano de rotação (PURO, sem I/O nem geração de chave). `newKidPlaceholder`
 * representa a chave nova que entraria na frente. Período de graça = manter as
 * `keep` chaves mais recentes; `retire: true` força `keep = 1` (remove TODAS as
 * antigas imediatamente — só a nova valida).
 */
export function planRotation(
  store: PersistedKeystore | null,
  keep: number,
  retire: boolean
): RotationPlan {
  const current = store?.keys ?? []
  const effectiveKeep = retire ? 1 : Math.max(1, keep)
  const projected = ['<new>', ...current.map((k) => k.kid as string)]
  const keptKids = projected.slice(0, effectiveKeep)
  const retiredKids = projected.slice(effectiveKeep)
  return {
    currentKid: current[0]?.kid ?? null,
    keptKids,
    retiredKids,
    keep: effectiveKeep,
  }
}

/**
 * Rotaciona o keystore: gera uma chave nova, coloca-a NA FRENTE (vira a chave de
 * assinatura corrente) e mantém apenas as `keep` mais recentes (default 2) para
 * que tokens assinados com a chave anterior continuem validando (período de graça).
 * Com `retire: true`, mantém SÓ a nova chave (aposenta todas as antigas de imediato).
 * Persiste e retorna o keystore atualizado.
 */
export async function rotateKeystore(
  path: string,
  alg: SigningAlg,
  keep = 2,
  retire = false
): Promise<{ store: PersistedKeystore; newKid: string; retiredKids: string[] }> {
  const current = readKeystore(path) ?? { keys: [] }
  const fresh = await generateSigningJwk(alg)
  const next = [fresh, ...current.keys]
  const effectiveKeep = retire ? 1 : Math.max(1, keep)
  const kept = next.slice(0, effectiveKeep)
  const retiredKids = next.slice(effectiveKeep).map((k) => k.kid)
  const store: PersistedKeystore = { keys: kept }
  writeKeystore(path, store)
  return { store, newKid: fresh.kid, retiredKids }
}

/** Deriva o JWKS PÚBLICO (sem `d` e demais campos privados) a partir do privado. */
export function toPublicJwks(store: PersistedKeystore): { keys: Record<string, any>[] } {
  // `iat` é um metadado interno do keystore (idade da chave), não um membro JWK —
  // removido do JWKS público junto com os campos da chave privada.
  const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'iat']
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
