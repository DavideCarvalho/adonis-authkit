/**
 * Serializer canônico de coluna JSON para os mixins. Centraliza o par
 * `prepare`/`consume` (`JSON.stringify`/`JSON.parse`) que cada mixin escrevia à
 * mão com tratamentos de null/default ligeiramente diferentes.
 *
 * As opções parametrizam exatamente as variações observadas entre os mixins, de
 * modo que o comportamento por coluna fica IDÊNTICO ao código original:
 *
 * - `fallback`: valor devolvido por `consume` quando a coluna é null/undefined
 *   (ex.: `[]` para `globalRoles`/`scopes`; `null` para `recoveryCodes`/`metadata`).
 * - `emptyOnWrite`: o que `prepare` grava quando o valor é "vazio" (null/undefined,
 *   ou — quando `treatEmptyArrayAsEmpty` — um array de length 0). `'null'` grava
 *   `null` na coluna; `'serialize'` ainda serializa (ex.: `globalRoles` grava
 *   `"[]"`). Default: `'null'`.
 * - `treatEmptyArrayAsEmpty`: quando true, um array vazio também conta como "vazio"
 *   no write (caso do `transports`, que grava null em `[]`). Default: false.
 */
export interface JsonColumnOptions<T> {
  /** Valor devolvido por `consume` quando a coluna está null/undefined. */
  fallback: T;
  /** O que `prepare` grava para valores vazios. Default: 'null'. */
  emptyOnWrite?: 'null' | 'serialize';
  /** Trata array vazio como "vazio" no write (grava null). Default: false. */
  treatEmptyArrayAsEmpty?: boolean;
}

/**
 * Devolve o par `{ prepare, consume }` para usar num `@column({...})`.
 * `T` é o tipo lógico da coluna (ex.: `string[]` ou `Record<string, unknown>`).
 */
export function jsonColumn<T>(opts: JsonColumnOptions<T>): {
  prepare: (value: T | null | undefined) => string | null;
  consume: (value: unknown) => T;
} {
  const emptyOnWrite = opts.emptyOnWrite ?? 'null';
  const treatEmptyArrayAsEmpty = opts.treatEmptyArrayAsEmpty ?? false;

  const isEmpty = (value: T | null | undefined): boolean => {
    if (value === null || value === undefined) return true;
    if (treatEmptyArrayAsEmpty && Array.isArray(value) && value.length === 0) return true;
    return false;
  };

  return {
    prepare: (value) => {
      if (isEmpty(value)) {
        return emptyOnWrite === 'serialize' ? JSON.stringify(opts.fallback) : null;
      }
      return JSON.stringify(value);
    },
    consume: (value) => {
      if (value === null || value === undefined) return opts.fallback;
      // Drivers de Postgres entregam colunas json/jsonb JÁ desserializadas
      // (objeto/array); SQLite entrega TEXT. Só strings precisam de JSON.parse —
      // parsear um objeto vira JSON.parse("[object Object]") e explode.
      if (typeof value !== 'string') return value as T;
      try {
        return JSON.parse(value) as T;
      } catch {
        return opts.fallback;
      }
    },
  };
}
