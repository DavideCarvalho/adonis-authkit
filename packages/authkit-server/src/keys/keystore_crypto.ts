import type { EncryptionLike } from './keystore_codec.js';

/**
 * Carrega o serviço de encryption do app (APP_KEY) de forma LAZY. Diferente do
 * encrypter do TOTP (que degrada p/ plaintext), aqui o caller decide o que fazer
 * com a ausência — o keystore exige determinismo. Em testes, injete via
 * {@link __setEncryptionServiceForTests}.
 */
let injected: EncryptionLike | undefined;

export function __setEncryptionServiceForTests(svc: EncryptionLike | undefined): void {
  injected = svc;
}

/** Retorna o serviço injetado (testes) ou undefined. */
export function getInjectedEncryptionService(): EncryptionLike | undefined {
  return injected;
}

/**
 * Resolve o serviço de encryption: injeção (testes) tem prioridade; senão importa
 * `@adonisjs/core/services/encryption`. Lança se nenhum estiver disponível.
 */
export async function loadEncryptionService(): Promise<EncryptionLike> {
  if (injected) return injected;
  const mod = await import('@adonisjs/core/services/encryption');
  const svc = (mod as { default?: EncryptionLike }).default;
  if (!svc) throw new Error('AuthKit keystore: serviço de encryption (APP_KEY) indisponível.');
  return svc;
}
