import { createHash, randomBytes } from 'node:crypto';

/** Gera um Personal Access Token opaco no formato `pat_<base64url>`. */
export function generatePatToken(): string {
  return `pat_${randomBytes(32).toString('base64url')}`;
}

/** SHA-256 (hex) do token — é o que se persiste; o token cru nunca é guardado. */
export function hashPatToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
