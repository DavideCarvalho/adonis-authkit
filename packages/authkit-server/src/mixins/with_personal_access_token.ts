import type { NormalizeConstructor } from '@adonisjs/core/types/helpers';
import { BaseModel, column } from '@adonisjs/lucid/orm';
import { DateTime } from 'luxon';
import { jsonColumn } from './json_column.js';

/** Instância composta pelo mixin {@link withPersonalAccessToken}. */
export interface PersonalAccessTokenRow {
  userId: string;
  name: string;
  tokenHash: string;
  scopes: string[];
  audience: string | null;
  expiresAt: DateTime | null;
  lastUsedAt: DateTime | null;
  createdAt: DateTime;
  updatedAt: DateTime;
}

export type PersonalAccessTokenClass<Model extends NormalizeConstructor<typeof BaseModel>> =
  Model & { new (...args: any[]): PersonalAccessTokenRow };

export function withPersonalAccessToken() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model,
  ): PersonalAccessTokenClass<Model> => {
    class PatMixin extends superclass {
      @column()
      declare userId: string;

      @column()
      declare name: string;

      @column({ serializeAs: null })
      declare tokenHash: string;

      // null quando vazio na escrita; fallback de leitura → [].
      @column(jsonColumn<string[]>({ fallback: [] }))
      declare scopes: string[];

      @column()
      declare audience: string | null;

      @column.dateTime()
      declare expiresAt: DateTime | null;

      @column.dateTime()
      declare lastUsedAt: DateTime | null;

      @column.dateTime({ autoCreate: true })
      declare createdAt: DateTime;

      @column.dateTime({ autoCreate: true, autoUpdate: true })
      declare updatedAt: DateTime;
    }

    return PatMixin as unknown as PersonalAccessTokenClass<Model>;
  };
}
