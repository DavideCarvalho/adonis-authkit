import type { Identity, SessionResolver } from '@adonis-agora/authkit-core';
import type { HttpContext } from '@adonisjs/core/http';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { buildIdentityFromClaims } from './identity.js';

export interface JwtResolverConfig {
  issuer: string;
  jwksUri: string;
  audience: string;
  globalRolesClaim: string;
  /** algoritmos de assinatura aceitos (defesa contra alg-confusion). Default: asimétricos. */
  algorithms?: string[];
  /** de onde extrair o token cru no request; injetado pelo factory */
  getToken?: (ctx: HttpContext) => string | null;
}

const DEFAULT_ALGS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'EdDSA',
];

export class JwtResolver implements SessionResolver {
  #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private config: JwtResolverConfig) {
    this.#jwks = createRemoteJWKSet(new URL(config.jwksUri));
  }

  /** Valida um JWT cru e monta a Identity (ou null se inválido). */
  async resolveToken(token: string): Promise<Identity | null> {
    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms ?? DEFAULT_ALGS,
      });
      // uma identidade válida exige um subject (`sub`)
      if (!payload.sub) return null;
      return buildIdentityFromClaims(
        payload as Record<string, unknown>,
        this.config.globalRolesClaim,
      );
    } catch {
      return null;
    }
  }

  async resolve(ctx: HttpContext): Promise<Identity | null> {
    const token = this.config.getToken?.(ctx) ?? null;
    if (!token) return null;
    return this.resolveToken(token);
  }
}
