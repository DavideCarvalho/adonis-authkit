import { test } from "@japa/runner";
import { wrap, retry } from "@adonis-agora/resilience";
import {
  resilientFetch,
  type ResiliencePolicy,
} from "../src/http/resilient_fetch.js";
import {
  discoverEndpoints,
  __clearDiscoveryCacheForTests,
} from "../src/discovery.js";
import { exchangeCode } from "../src/oidc_login.js";

function okResponse(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as Response;
}

/** Conta as invocações de um fetch fake e devolve sempre 200. */
function countingFetch(json: unknown = {}) {
  let calls = 0;
  const impl = (async () => {
    calls++;
    return okResponse(json);
  }) as typeof fetch;
  return { impl, calls: () => calls };
}

test.group("resilientFetch helper", () => {
  test("sem política → passthrough puro (uma única chamada de fetch)", async ({
    assert,
  }) => {
    const f = countingFetch({ ok: true });
    const res = await resilientFetch(
      "https://idp.test/x",
      undefined,
      undefined,
      f.impl,
    );
    assert.equal(f.calls(), 1);
    assert.isTrue(res.ok);
  });

  test("com política → roda fetch dentro de policy.execute", async ({
    assert,
  }) => {
    const f = countingFetch({ ok: true });
    let wrapped = 0;
    const policy: ResiliencePolicy = {
      execute: (fn) => {
        wrapped++;
        return fn();
      },
    };
    await resilientFetch("https://idp.test/x", undefined, policy, f.impl);
    assert.equal(wrapped, 1);
    assert.equal(f.calls(), 1);
  });

  test("política que retenta → o fetch é re-executado", async ({ assert }) => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) throw new Error("network blip");
      return okResponse({ ok: true });
    }) as typeof fetch;

    // Fake estrutural de política: retenta a operação até 3 vezes.
    const retrying: ResiliencePolicy = {
      async execute(fn) {
        let last: unknown;
        for (let i = 0; i < 3; i++) {
          try {
            return await fn();
          } catch (err) {
            last = err;
          }
        }
        throw last;
      },
    };

    const res = await resilientFetch(
      "https://idp.test/x",
      undefined,
      retrying,
      flaky,
    );
    assert.equal(calls, 3);
    assert.isTrue(res.ok);
  });

  test("wrap/retry reais de @adonis-agora/resilience envolvem a chamada", async ({
    assert,
  }) => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 2) throw new Error("boom");
      return okResponse({ ok: true });
    }) as typeof fetch;

    const policy = wrap(retry({ attempts: 3 }));
    const res = await resilientFetch(
      "https://idp.test/x",
      undefined,
      policy,
      flaky,
    );
    assert.equal(calls, 2);
    assert.isTrue(res.ok);
  });
});

test.group("resilience threaded através de discovery + oidc_login", (group) => {
  group.each.setup(() => __clearDiscoveryCacheForTests());

  test("discoverEndpoints sem resilience → fetch chamado uma vez", async ({
    assert,
  }) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return okResponse({ token_endpoint: "https://idp.test/oidc/token" });
    }) as typeof fetch;

    await discoverEndpoints("https://idp.test/oidc", { fetchImpl: f });
    assert.equal(calls, 1);
  });

  test("discoverEndpoints com política retentadora → re-executa o fetch", async ({
    assert,
  }) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      if (calls < 2) throw new Error("blip");
      return okResponse({ token_endpoint: "https://idp.test/oidc/token" });
    }) as typeof fetch;

    const endpoints = await discoverEndpoints("https://idp.test/oidc", {
      fetchImpl: f,
      resilience: wrap(retry({ attempts: 3 })),
    });
    assert.equal(calls, 2);
    assert.equal(endpoints.tokenEndpoint, "https://idp.test/oidc/token");
  });

  test("exchangeCode sem resilience → uma única chamada (back-compat)", async ({
    assert,
  }) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return okResponse({ access_token: "at" });
    }) as typeof fetch;

    const tokens = await exchangeCode({
      issuer: "https://idp.test/oidc",
      clientId: "app",
      redirectUri: "https://app/cb",
      code: "c",
      codeVerifier: "v",
      fetchImpl: f,
    });
    assert.equal(calls, 1);
    assert.equal(tokens.accessToken, "at");
  });

  test("exchangeCode com política retentadora → re-executa a chamada ao token endpoint", async ({
    assert,
  }) => {
    let calls = 0;
    const f = (async () => {
      calls++;
      if (calls < 2) throw new Error("idp down");
      return okResponse({ access_token: "at" });
    }) as typeof fetch;

    const tokens = await exchangeCode({
      issuer: "https://idp.test/oidc",
      clientId: "app",
      redirectUri: "https://app/cb",
      code: "c",
      codeVerifier: "v",
      fetchImpl: f,
      resilience: wrap(retry({ attempts: 3 })),
    });
    assert.equal(calls, 2);
    assert.equal(tokens.accessToken, "at");
  });
});
