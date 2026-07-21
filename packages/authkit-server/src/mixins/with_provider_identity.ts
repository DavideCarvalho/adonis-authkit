import type { NormalizeConstructor } from '@adonisjs/core/types/helpers';
import { BaseModel, column } from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';

/**
 * Instância composta pelo mixin {@link withProviderIdentity}. Liga uma conta
 * (`accountId`) a uma identidade externa `(provider, providerUserId)` — ex.:
 * Google, GitHub. Uma conta pode ter várias identidades (account linking).
 */
export interface ProviderIdentityRow {
  provider: string;
  providerUserId: string;
  accountId: string;
  email: string | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export type ProviderIdentityClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): ProviderIdentityRow;
};

export function withProviderIdentity() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model,
  ): ProviderIdentityClass<Model> => {
    class ProviderIdentityMixin extends superclass {
      @column()
      declare provider: string;

      @column()
      declare providerUserId: string;

      @column()
      declare accountId: string;

      @column()
      declare email: string | null;

      @column.dateTime({ autoCreate: true })
      declare createdAt: DateTime;

      @column.dateTime({ autoCreate: true, autoUpdate: true })
      declare updatedAt: DateTime;
    }

    return ProviderIdentityMixin as unknown as ProviderIdentityClass<Model>;
  };
}
