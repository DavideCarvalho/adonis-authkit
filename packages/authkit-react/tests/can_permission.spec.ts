/**
 * Testes do gating por permissão da Authz: `checkCan`, `useCan` e
 * `<CanPermission>`. Contrato fixo: `POST <canPath>` com
 * `{ permission, resource? }` → `{ allowed }`.
 *
 * As partes que dependem de efeito assíncrono do React são cobertas via
 * `checkCan` (a lógica real de fetch/cache/dedupe). A renderização síncrona
 * (cache quente + ramo de `loading`) é coberta via `react-dom/server`.
 */
import { test } from "@japa/runner";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkCan, useCan, canCache } from "../src/hooks/use_can.js";
import { CanPermission } from "../src/components/can_permission.js";
import { AuthkitConfigContext, resolveConfig } from "../src/config.js";

/** Instala um `fetch` fake global e devolve as chamadas + restaurador. */
function installFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as any;
  return {
    calls,
    restore() {
      globalThis.fetch = prev;
    },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test.group("useCan/CanPermission — exports", () => {
  test("useCan e CanPermission são funções", ({ assert }) => {
    assert.isFunction(useCan);
    assert.isFunction(CanPermission);
  });
});

test.group("checkCan — contrato e fetch", (group) => {
  group.each.setup(() => {
    canCache.clear();
  });

  test("faz POST no path com { permission, resource } e credenciais", async ({
    assert,
  }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: true }));
    try {
      const allowed = await checkCan("/authz/can", "posts.update", "post:1");
      assert.isTrue(allowed);
      assert.lengthOf(fetchMock.calls, 1);
      const call = fetchMock.calls[0];
      assert.equal(call.url, "/authz/can");
      assert.equal(call.init?.method, "POST");
      assert.equal(call.init?.credentials, "same-origin");
      assert.deepEqual(JSON.parse(String(call.init?.body)), {
        permission: "posts.update",
        resource: "post:1",
      });
    } finally {
      fetchMock.restore();
    }
  });

  test("allowed:false → deny", async ({ assert }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: false }));
    try {
      assert.isFalse(await checkCan("/authz/can", "posts.delete"));
    } finally {
      fetchMock.restore();
    }
  });

  test("omite resource quando ausente", async ({ assert }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: true }));
    try {
      await checkCan("/authz/can", "posts.read");
      assert.deepEqual(JSON.parse(String(fetchMock.calls[0].init?.body)), {
        permission: "posts.read",
      });
    } finally {
      fetchMock.restore();
    }
  });

  test("memoiza o resultado por (path, permission, resource)", async ({
    assert,
  }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: true }));
    try {
      await checkCan("/authz/can", "posts.update", "post:1");
      await checkCan("/authz/can", "posts.update", "post:1");
      assert.lengthOf(fetchMock.calls, 1);
    } finally {
      fetchMock.restore();
    }
  });

  test("deduplica requests concorrentes", async ({ assert }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: true }));
    try {
      const [a, b] = await Promise.all([
        checkCan("/authz/can", "x"),
        checkCan("/authz/can", "x"),
      ]);
      assert.isTrue(a);
      assert.isTrue(b);
      assert.lengthOf(fetchMock.calls, 1);
    } finally {
      fetchMock.restore();
    }
  });

  test("chaves diferentes não colidem", async ({ assert }) => {
    const fetchMock = installFetch(() => jsonResponse({ allowed: true }));
    try {
      await checkCan("/authz/can", "a");
      await checkCan("/authz/can", "b");
      await checkCan("/authz/can", "a", "r");
      assert.lengthOf(fetchMock.calls, 3);
    } finally {
      fetchMock.restore();
    }
  });
});

test.group("useCan — render (cache quente / loading)", (group) => {
  group.each.setup(() => {
    canCache.clear();
  });

  function renderCanPermission(
    permission: string,
    opts: { resource?: string } = {},
  ) {
    const config = resolveConfig();
    return renderToStaticMarkup(
      createElement(
        AuthkitConfigContext.Provider,
        { value: config },
        createElement(
          CanPermission,
          {
            permission,
            resource: opts.resource,
            fallback: "NO",
            loadingFallback: "LOAD",
          },
          "YES",
        ),
      ),
    );
  }

  test("cache quente allowed → renderiza children (sem loading)", ({
    assert,
  }) => {
    canCache.resolved.set("/authz/can|posts.update|", true);
    assert.equal(renderCanPermission("posts.update"), "YES");
  });

  test("cache quente denied → renderiza fallback", ({ assert }) => {
    canCache.resolved.set("/authz/can|posts.delete|", false);
    assert.equal(renderCanPermission("posts.delete"), "NO");
  });

  test("sem cache → estado inicial loading (renderiza loadingFallback)", ({
    assert,
  }) => {
    assert.equal(renderCanPermission("posts.read"), "LOAD");
  });
});
