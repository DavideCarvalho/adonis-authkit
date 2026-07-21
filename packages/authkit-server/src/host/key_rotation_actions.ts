import type { ManagedKeyInfo } from '../keys/keystore.js';
import { type ResolvedKeyRotationSetting, resolveEffectiveKeyRotation } from './key_rotation.js';
import type { SettingsCapability } from './runtime_settings.js';

/**
 * Ações compartilhadas de rotação de chave. Funções puras-ish que tanto a Admin
 * REST API (Bearer) quanto o console (sessão) chamam, evitando duplicar a lógica
 * de status (idade + política + ETA) e de rotação (validação de keep/retire).
 */

export interface KeysStatus {
  ageDays: number;
  policy: ResolvedKeyRotationSetting;
  nextRotationInDays: number | null;
  keys: ManagedKeyInfo[];
}

/**
 * Status da chave de assinatura managed. Retorna null quando o serviço não tem
 * keystore gerenciável (jwks não é managed+store) — o controller traduz para 501.
 * A política vem do runtime settings; sem settings, usa defaults (rotação off).
 */
export async function buildKeysStatus(
  svc: {
    keystoreAgeDays(): Promise<number | null>;
    listManagedKeys(): Promise<ManagedKeyInfo[]>;
  },
  settings: SettingsCapability | null,
): Promise<KeysStatus | null> {
  const ageDays = await svc.keystoreAgeDays();
  if (ageDays === null) return null;
  const policy = settings
    ? await resolveEffectiveKeyRotation(settings)
    : { enabled: false, maxAgeDays: 90, keep: 2 };
  const nextRotationInDays = policy.enabled ? Math.max(0, policy.maxAgeDays - ageDays) : null;
  const keys = await svc.listManagedKeys();
  return { ageDays, policy, nextRotationInDays, keys };
}

/**
 * Rotaciona a chave agora. Valida `keep` (>= 1, default 2) e `retire` do body.
 * A aplicação ao vivo + auditoria (keys.rotated) acontecem dentro de svc.rotateKeys.
 */
export async function rotateNow(
  svc: {
    rotateKeys(
      keep: number,
      retire?: boolean,
    ): Promise<{ newKid: string; retiredKids: string[]; keptKids: string[] }>;
  },
  body: { retire?: boolean; keep?: number } | undefined,
): Promise<{ rotated: true; newKid: string; retiredKids: string[]; keptKids: string[] }> {
  const retire = body?.retire === true;
  const keep = typeof body?.keep === 'number' && body.keep >= 1 ? Math.floor(body.keep) : 2;
  const res = await svc.rotateKeys(keep, retire);
  return { rotated: true, ...res };
}
