/**
 * Testes do login por passkey disparado por clique (as três camadas):
 *   - authenticatePasskey (tier 3): cerimônia real, com fetch + startAuthentication
 *     injetados — cobertura comportamental (prove-by-mutation).
 *   - submitPasskeyVerification (tier 3): SSR-safe sem `document`.
 *   - usePasskeyLogin (tier 2) e PasskeyButton (tier 1): exportados e com o shape certo
 *     (o comportamento com useState/DOM não roda em Node, como nos demais specs React).
 */

import { test } from "@japa/runner";
import {
  authenticatePasskey,
  submitPasskeyVerification,
  loadStartAuthentication,
  type PasskeyCeremonyDeps,
  type StartAuthenticationFn,
} from "../src/passkey/authenticate.js";
import {
  usePasskeyLogin,
  type UsePasskeyLoginOptions,
} from "../src/hooks/use_passkey_login.js";
import { PasskeyButton } from "../src/components/passkey_button.js";

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

/** Captura o que a cerimônia enviou, devolvendo options fixas e uma assertion fixa. */
function stubDeps(overrides: Partial<PasskeyCeremonyDeps> = {}) {
  const calls: {
    fetchUrl?: string;
    fetchInit?: RequestInit;
    startInput?: unknown;
  } = {};
  const startAuthentication: StartAuthenticationFn = async (opts) => {
    calls.startInput = opts.optionsJSON;
    return { id: "assertion-xyz", type: "public-key" };
  };
  const deps: PasskeyCeremonyDeps = {
    fetch: (async (url: string, init?: RequestInit) => {
      calls.fetchUrl = url;
      calls.fetchInit = init;
      return okResponse({ challenge: "chal-1" });
    }) as unknown as typeof globalThis.fetch,
    loadStartAuthentication: async () => startAuthentication,
    ...overrides,
  };
  return { deps, calls };
}

test.group("authenticatePasskey (tier 3 — cerimônia)", () => {
  test("POSTs to optionsUrl and returns the assertion serialized", async ({
    assert,
  }) => {
    const { deps, calls } = stubDeps();
    const result = await authenticatePasskey({ optionsUrl: "/opts" }, deps);

    assert.equal(calls.fetchUrl, "/opts");
    assert.equal(calls.fetchInit?.method, "POST");
    // A assertion devolvida por startAuthentication volta serializada.
    assert.equal(
      result,
      JSON.stringify({ id: "assertion-xyz", type: "public-key" }),
    );
  });

  test("feeds the fetched options straight into startAuthentication", async ({
    assert,
  }) => {
    const { deps, calls } = stubDeps();
    await authenticatePasskey({ optionsUrl: "/opts" }, deps);
    // O que o servidor devolveu é exatamente o que vai pro browser.
    assert.deepEqual(calls.startInput, { challenge: "chal-1" });
  });

  test("sends the CSRF header only when a token is provided", async ({
    assert,
  }) => {
    const withToken = stubDeps();
    await authenticatePasskey(
      { optionsUrl: "/opts", csrfToken: "tok-9" },
      withToken.deps,
    );
    const headers = withToken.calls.fetchInit?.headers as Record<
      string,
      string
    >;
    assert.equal(headers["x-csrf-token"], "tok-9");

    const without = stubDeps();
    await authenticatePasskey({ optionsUrl: "/opts" }, without.deps);
    const headers2 = without.calls.fetchInit?.headers as Record<string, string>;
    assert.isUndefined(headers2["x-csrf-token"]);
  });

  test("throws when the options request is not ok (no ceremony)", async ({
    assert,
  }) => {
    let started = false;
    const deps: PasskeyCeremonyDeps = {
      fetch: (async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({}),
        }) as unknown as Response) as unknown as typeof globalThis.fetch,
      loadStartAuthentication: async () => {
        started = true;
        return (async () => ({})) as StartAuthenticationFn;
      },
    };
    await assert.rejects(() =>
      authenticatePasskey({ optionsUrl: "/opts" }, deps),
    );
    // Falha no options não deve nem tentar a cerimônia do browser.
    assert.isFalse(started);
  });
});

test.group("submitPasskeyVerification (tier 3)", () => {
  test("SSR-safe: no-op without document", ({ assert }) => {
    assert.equal(typeof document, "undefined");
    assert.doesNotThrow(() =>
      submitPasskeyVerification({
        verifyUrl: "/verify",
        assertion: "{}",
        csrfToken: "t",
      }),
    );
  });
});

test.group("usePasskeyLogin / PasskeyButton — exports e types", () => {
  test("loadStartAuthentication is exported as a function", ({ assert }) => {
    assert.isFunction(loadStartAuthentication);
  });

  test("usePasskeyLogin is exported as a function", ({ assert }) => {
    assert.isFunction(usePasskeyLogin);
  });

  test("UsePasskeyLoginOptions shape is correct", ({ assert }) => {
    const opts: UsePasskeyLoginOptions = {
      optionsUrl: "/auth/interaction/uid/passkey/options",
      verifyUrl: "/auth/interaction/uid/passkey/verify",
      csrfToken: "abc",
      onSuccess: (_assertion: string) => {},
    };
    assert.equal(opts.optionsUrl, "/auth/interaction/uid/passkey/options");
    assert.equal(opts.verifyUrl, "/auth/interaction/uid/passkey/verify");
    assert.equal(opts.csrfToken, "abc");
    assert.isFunction(opts.onSuccess);
  });

  test("PasskeyButton is exported as a function component", ({ assert }) => {
    assert.isFunction(PasskeyButton);
  });
});
