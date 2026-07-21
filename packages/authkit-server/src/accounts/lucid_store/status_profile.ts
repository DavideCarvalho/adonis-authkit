import { DateTime } from 'luxon';
import type {
  AccountDeletionCapability,
  AccountStatusCapability,
  EmailVerificationStatusCapability,
  ProfileCapability,
} from '../account_store.js';
import type { LucidStoreContext } from './shared.js';

/**
 * Indica se o model declara uma coluna (pela propriedade do model, ex.: `disabledAt`).
 * Lucid expõe as colunas em `$columnsDefinitions` (Map de propertyName → definição).
 * Usado para montar as capacidades opcionais SÓ quando a coluna existe — assim o
 * store degrada graciosamente (capacidade ausente) em models que não têm a coluna.
 */
export function hasColumn(Model: any, property: string): boolean {
  const defs = Model?.$columnsDefinitions;
  if (!defs || typeof defs.has !== 'function') return false;
  return defs.has(property);
}

/**
 * Status da conta (habilitar/desabilitar) sobre a coluna `disabled_at`
 * (propriedade `disabledAt`) do model. Só deve ser montado quando a coluna existe
 * ({@link hasColumn}).
 */
export function buildStatus(ctx: LucidStoreContext): AccountStatusCapability {
  const { Model } = ctx;
  return {
    async disableAccount(accountId) {
      const row = await Model.find(accountId);
      if (!row) return;
      row.disabledAt = DateTime.now();
      await row.save();
    },
    async enableAccount(accountId) {
      const row = await Model.find(accountId);
      if (!row) return;
      row.disabledAt = null;
      await row.save();
    },
    async isDisabled(accountId) {
      const row = await Model.find(accountId);
      if (!row) return false;
      return row.disabledAt !== null && row.disabledAt !== undefined;
    },
  };
}

/**
 * Edição de perfil (nome/avatar) sobre as colunas `full_name`/`avatar_url` do
 * model. Grava apenas as colunas que existirem. Só deve ser montado quando ao
 * menos uma das colunas existe.
 */
export function buildProfile(ctx: LucidStoreContext): ProfileCapability {
  const { Model, toAccount } = ctx;
  const canName = hasColumn(Model, 'fullName');
  const canAvatar = hasColumn(Model, 'avatarUrl');
  return {
    async updateProfile(accountId, patch) {
      const row = await Model.find(accountId);
      if (!row) return null;
      if (canName && patch.name !== undefined) row.fullName = patch.name;
      if (canAvatar && patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl;
      await row.save();
      return toAccount(row);
    },
  };
}

/**
 * Estado de verificação de e-mail (leitura) sobre a coluna `email_verified_at`
 * (propriedade `emailVerifiedAt`) do model. Só deve ser montado quando a coluna
 * existe ({@link hasColumn}) — caso contrário a capacidade fica ausente e features
 * como `requireVerifiedEmail` degradam (não bloqueiam).
 */
export function buildEmailVerificationStatus(
  ctx: LucidStoreContext,
): EmailVerificationStatusCapability {
  const { Model } = ctx;
  return {
    async isEmailVerified(accountId) {
      const row = await Model.find(accountId);
      if (!row) return false;
      return row.emailVerifiedAt !== null && row.emailVerifiedAt !== undefined;
    },
  };
}

/**
 * Deleção (hard delete) da linha da conta. Sempre disponível num model Lucid
 * (qualquer model pode deletar). Apenas remove a própria conta — o cascade dos
 * demais artefatos é orquestrado pelo `accountDeletionService` no host.
 */
export function buildDeletion(ctx: LucidStoreContext): AccountDeletionCapability {
  const { Model } = ctx;
  return {
    async deleteAccount(accountId) {
      const row = await Model.find(accountId);
      if (!row) return false;
      await row.delete();
      return true;
    },
  };
}
