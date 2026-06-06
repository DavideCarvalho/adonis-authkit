import { test } from '@japa/runner'
import { jsonColumn } from '../../src/mixins/json_column.js'

/**
 * Regressão Postgres: drivers de PG entregam colunas json/jsonb JÁ desserializadas
 * (objeto/array), enquanto SQLite entrega TEXT. `consume` fazia JSON.parse cego e
 * explodia com `"[object Object]" is not valid JSON` ao hidratar models em PG
 * (ex.: global_roles no adminGuard → 500 no console admin).
 */
test.group('mixins | jsonColumn consume', () => {
  const col = jsonColumn<string[]>({ fallback: [] })

  test('string JSON é parseada (SQLite/TEXT)', ({ assert }) => {
    assert.deepEqual(col.consume('["ADMIN"]'), ['ADMIN'])
  })

  test('array já desserializado passa direto (PG json/jsonb)', ({ assert }) => {
    assert.deepEqual(col.consume(['ADMIN']), ['ADMIN'])
  })

  test('objeto já desserializado passa direto (PG json/jsonb)', ({ assert }) => {
    const obj = jsonColumn<Record<string, unknown> | null>({ fallback: null })
    assert.deepEqual(obj.consume({ a: 1 }), { a: 1 })
  })

  test('null/undefined viram fallback', ({ assert }) => {
    assert.deepEqual(col.consume(null), [])
    assert.deepEqual(col.consume(undefined), [])
  })

  test('string inválida vira fallback (fail-safe, não explode)', ({ assert }) => {
    assert.deepEqual(col.consume('[object Object]'), [])
  })
})
