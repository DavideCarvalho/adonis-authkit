import type { Identity } from '@adonis-agora/authkit-core';
import { test } from '@japa/runner';
import { Authenticator } from '../src/authenticator.js';
import { populateContext } from '../src/observability/context_bridge.js';

const SET_SLOT = Symbol.for('@agora/context:set');

type Patch = {
  userRef?: { type: string; id: string };
  tenantId?: string;
  globalRoles?: string[];
  [k: string]: unknown;
};

/** Instala um set fake no slot global e devolve um restaurador + os patches. */
function installFakeSet() {
  const patches: Patch[] = [];
  const prev = (globalThis as Record<symbol, unknown>)[SET_SLOT];
  (globalThis as Record<symbol, unknown>)[SET_SLOT] = (patch: Patch) => {
    patches.push(patch);
  };
  const restore = () => {
    (globalThis as Record<symbol, unknown>)[SET_SLOT] = prev;
  };
  return { patches, restore };
}

function clearSlot() {
  const prev = (globalThis as Record<symbol, unknown>)[SET_SLOT];
  delete (globalThis as Record<symbol, unknown>)[SET_SLOT];
  return () => {
    (globalThis as Record<symbol, unknown>)[SET_SLOT] = prev;
  };
}

const baseIdentity: Identity = {
  userId: 'u1',
  email: 'a@b.com',
  globalRoles: ['ADMIN'],
  issuedAt: 0,
  expiresAt: 0,
  raw: {},
};

test.group('observability/context_bridge', () => {
  test('populateContext escreve userRef no slot', ({ assert }) => {
    const { patches, restore } = installFakeSet();
    try {
      populateContext(baseIdentity);
    } finally {
      restore();
    }
    assert.lengthOf(patches, 1);
    assert.deepEqual(patches[0].userRef, { type: 'user', id: 'u1' });
    assert.isUndefined(patches[0].tenantId);
    assert.deepEqual(patches[0].globalRoles, ['ADMIN']);
  });

  test('populateContext deriva tenantId da claim de org ativa', ({ assert }) => {
    const { patches, restore } = installFakeSet();
    try {
      populateContext({
        ...baseIdentity,
        raw: { active_organization_id: 'org-42' },
      });
    } finally {
      restore();
    }
    assert.lengthOf(patches, 1);
    assert.equal(patches[0].tenantId, 'org-42');
    assert.deepEqual(patches[0].userRef, { type: 'user', id: 'u1' });
  });

  test('populateContext é no-op (não lança) quando o slot está ausente', ({ assert }) => {
    const restore = clearSlot();
    try {
      assert.doesNotThrow(() => populateContext(baseIdentity));
    } finally {
      restore();
    }
  });

  test('populateContext não propaga erro do slot (best-effort)', ({ assert }) => {
    const prev = (globalThis as Record<symbol, unknown>)[SET_SLOT];
    (globalThis as Record<symbol, unknown>)[SET_SLOT] = () => {
      throw new Error('boom no context');
    };
    try {
      assert.doesNotThrow(() => populateContext(baseIdentity));
    } finally {
      (globalThis as Record<symbol, unknown>)[SET_SLOT] = prev;
    }
  });
});

test.group('observability/context_bridge — via Authenticator.getIdentity', () => {
  test('getIdentity popula o contexto no caminho de sucesso', async ({ assert }) => {
    const { patches, restore } = installFakeSet();
    try {
      const auth = new Authenticator({} as any, {
        resolver: { resolve: async () => baseIdentity } as any,
      });
      await auth.getIdentity();
    } finally {
      restore();
    }
    assert.lengthOf(patches, 1);
    assert.deepEqual(patches[0].userRef, { type: 'user', id: 'u1' });
  });

  test('getIdentity NÃO escreve no contexto para sessão anônima (null)', async ({ assert }) => {
    const { patches, restore } = installFakeSet();
    try {
      const auth = new Authenticator({} as any, {
        resolver: { resolve: async () => null } as any,
      });
      await auth.getIdentity();
    } finally {
      restore();
    }
    assert.lengthOf(patches, 0);
  });

  test('getIdentity não lança quando o slot de contexto está ausente', async ({ assert }) => {
    const restore = clearSlot();
    try {
      const auth = new Authenticator({} as any, {
        resolver: { resolve: async () => baseIdentity } as any,
      });
      await assert.doesNotReject(() => auth.getIdentity());
    } finally {
      restore();
    }
  });
});
