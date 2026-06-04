import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthAccount } from '../account_store.js'

/**
 * Encripta/decripta um valor (ex.: o segredo TOTP) em repouso. Mantém a lib
 * desacoplada do serviço de encryption do app — qualquer implementação que
 * faça round-trip serve (em prod, normalmente o `@adonisjs/core/services/encryption`).
 * `decrypt` retorna `null` se o valor foi adulterado/é inválido.
 */
export interface AccountSecretEncrypter {
  encrypt(value: string): string
  decrypt(value: string): string | null
}

/**
 * Funções das cerimônias WebAuthn. Espelham a assinatura do `@simplewebauthn/server`
 * (subconjunto usado). Injetáveis via {@link LucidAccountStoreOptions.webauthnCeremonies}
 * para testes.
 */
export interface WebauthnCeremonies {
  generateRegistrationOptions: typeof generateRegistrationOptions
  verifyRegistrationResponse: typeof verifyRegistrationResponse
  generateAuthenticationOptions: typeof generateAuthenticationOptions
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse
}

/** RP (Relying Party) do WebAuthn usado nas cerimônias. */
export interface ResolvedRp {
  rpName: string
  rpId: string
  origin: string | string[]
}

/**
 * Contexto compartilhado pelos builders de capacidade. Carrega o model principal,
 * os helpers de segredo e (quando configurados) os models/parametros das capacidades.
 */
export interface LucidStoreContext {
  Model: any
  mfaIssuer: string
  recoveryCodeCount: number
  /** Encripta o segredo antes de persistir (no-op sem encrypter). */
  sealSecret(secret: string): string
  /** Decripta o segredo armazenado; null em falha/adulteração (no-op sem encrypter). */
  openSecret(stored: string | null | undefined): string | null
  toAccount(row: any): AuthAccount
}

export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex')

/** Recovery code legível: 10 chars hex em duas metades (ex.: a1b2c-3d4e5). */
export function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString('hex')
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`
}

/** Comparação de hashes hex resistente a timing. */
export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
