import { test } from '@japa/runner'
import {
  hasAllAppRoles,
  hasAllGlobalRoles,
  hasAnyAppRole,
  hasAnyGlobalRole,
  hasAppRole,
  hasGlobalRole,
} from '../src/roles.js'
import type { AuthUser } from '../src/types.js'

const user: AuthUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'Ana',
  globalRoles: ['ADMIN', 'TEACHER'],
  appRoles: ['EDITOR'],
}

const userNoAppRoles: AuthUser = {
  id: 'u2',
  email: 'c@d.com',
  globalRoles: ['STUDENT'],
}

test.group('hasGlobalRole', () => {
  test('verdadeiro quando o papel está presente', ({ assert }) => {
    assert.isTrue(hasGlobalRole(user, 'ADMIN'))
  })

  test('falso quando o papel está ausente', ({ assert }) => {
    assert.isFalse(hasGlobalRole(user, 'STUDENT'))
  })

  test('falso para usuário nulo', ({ assert }) => {
    assert.isFalse(hasGlobalRole(null, 'ADMIN'))
    assert.isFalse(hasGlobalRole(undefined, 'ADMIN'))
  })
})

test.group('hasAnyGlobalRole', () => {
  test('verdadeiro quando ao menos um papel bate', ({ assert }) => {
    assert.isTrue(hasAnyGlobalRole(user, ['STUDENT', 'TEACHER']))
  })

  test('falso quando nenhum papel bate', ({ assert }) => {
    assert.isFalse(hasAnyGlobalRole(user, ['STUDENT', 'GUEST']))
  })

  test('falso para usuário nulo', ({ assert }) => {
    assert.isFalse(hasAnyGlobalRole(null, ['ADMIN']))
  })

  test('falso para lista vazia', ({ assert }) => {
    assert.isFalse(hasAnyGlobalRole(user, []))
  })
})

test.group('hasAllGlobalRoles', () => {
  test('verdadeiro quando todos os papéis batem', ({ assert }) => {
    assert.isTrue(hasAllGlobalRoles(user, ['ADMIN', 'TEACHER']))
  })

  test('falso quando algum papel falta', ({ assert }) => {
    assert.isFalse(hasAllGlobalRoles(user, ['ADMIN', 'STUDENT']))
  })

  test('falso para usuário nulo', ({ assert }) => {
    assert.isFalse(hasAllGlobalRoles(null, ['ADMIN']))
  })

  test('verdadeiro para lista vazia (every vacuamente verdadeiro)', ({ assert }) => {
    assert.isTrue(hasAllGlobalRoles(user, []))
  })
})

test.group('hasAppRole', () => {
  test('verdadeiro quando o papel de app está presente', ({ assert }) => {
    assert.isTrue(hasAppRole(user, 'EDITOR'))
  })

  test('falso quando o papel de app está ausente', ({ assert }) => {
    assert.isFalse(hasAppRole(user, 'VIEWER'))
  })

  test('falso quando o usuário não tem appRoles', ({ assert }) => {
    assert.isFalse(hasAppRole(userNoAppRoles, 'EDITOR'))
  })

  test('falso para usuário nulo', ({ assert }) => {
    assert.isFalse(hasAppRole(null, 'EDITOR'))
  })
})

test.group('hasAnyAppRole / hasAllAppRoles', () => {
  test('any: verdadeiro quando ao menos um bate', ({ assert }) => {
    assert.isTrue(hasAnyAppRole(user, ['VIEWER', 'EDITOR']))
  })

  test('any: falso sem appRoles', ({ assert }) => {
    assert.isFalse(hasAnyAppRole(userNoAppRoles, ['EDITOR']))
  })

  test('all: falso quando algum falta', ({ assert }) => {
    assert.isFalse(hasAllAppRoles(user, ['EDITOR', 'VIEWER']))
  })

  test('all: verdadeiro quando todos batem', ({ assert }) => {
    assert.isTrue(hasAllAppRoles(user, ['EDITOR']))
  })

  test('any/all: falso para usuário nulo', ({ assert }) => {
    assert.isFalse(hasAnyAppRole(null, ['EDITOR']))
    assert.isFalse(hasAllAppRoles(null, ['EDITOR']))
  })
})
