/**
 * Cerimônia de passkey (WebAuthn) — a camada de funções (tier mais baixo) do
 * ecossistema de login por passkey. Ambos os hooks (`usePasskeyAutofill` para
 * conditional mediation e `usePasskeyLogin` para o clique explícito) reusam as
 * peças daqui, então a lógica de carregamento da lib e de fetch vive num único
 * lugar.
 *
 * `@simplewebauthn/browser` NÃO é dependência da lib: é importado de forma lazy,
 * com fallback de CDN, exatamente como o `login.edge` built-in faz. Um app que
 * já tem o pacote instalado usa a versão local; os demais caem no CDN.
 */

/**
 * Assinatura mínima de `startAuthentication` do `@simplewebauthn/browser` que a
 * cerimônia usa. Tipada localmente para não acoplar a lib ao pacote.
 */
export type StartAuthenticationFn = (
  opts: {
    optionsJSON: unknown;
    useBrowserAutofill?: boolean;
    verifyBrowserAutofillInput?: boolean;
  },
  signal?: AbortSignal,
) => Promise<unknown>;

const CDN_URL =
  "https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@13/dist/bundle/index.js";

/**
 * Carrega `startAuthentication` de forma lazy: tenta o pacote instalado no app
 * e, se não existir, cai no bundle do CDN. Lança se nenhum resolver — o chamador
 * decide o que fazer (o autofill silencia; o login explícito reporta falha).
 */
export async function loadStartAuthentication(): Promise<StartAuthenticationFn> {
  try {
    const mod = await import(
      // @ts-ignore — import dinâmico do pacote instalado pelo host (peer opcional).
      "@simplewebauthn/browser" as string
    );
    return mod.startAuthentication;
  } catch {
    const mod = await import(
      // @ts-ignore — fallback de CDN (mesmo bundle que o login.edge usa).
      CDN_URL as string
    );
    return mod.startAuthentication;
  }
}

export interface AuthenticatePasskeyOptions {
  /**
   * Endpoint `passkey/options` do interaction controller (POST). Deve devolver
   * as options de autenticação em JSON.
   */
  optionsUrl: string;
  /** CSRF token enviado no header `x-csrf-token` do POST de options, quando presente. */
  csrfToken?: string;
  /** AbortSignal para cancelar a cerimônia (ex.: unmount). */
  signal?: AbortSignal;
}

/**
 * Dependências injetáveis — o default usa `globalThis.fetch` e o loader lazy.
 * Existem para testar a cerimônia sem browser (mock de fetch + de startAuthentication)
 * e para o autofill reusar o mesmo loader. Chamadores normais omitem.
 */
export interface PasskeyCeremonyDeps {
  fetch?: typeof globalThis.fetch;
  loadStartAuthentication?: () => Promise<StartAuthenticationFn>;
}

/**
 * Roda a cerimônia de autenticação por passkey disparada por um clique explícito:
 * busca as options no servidor, chama `startAuthentication` e devolve a assertion
 * serializada. A verificação (POST de página inteira no `verifyUrl`) é responsabilidade
 * do chamador — ver `submitPasskeyVerification`.
 *
 * @returns `JSON.stringify` da assertion, pronta para ir no campo `response` do form de verify.
 */
export async function authenticatePasskey(
  options: AuthenticatePasskeyOptions,
  deps: PasskeyCeremonyDeps = {},
): Promise<string> {
  const { optionsUrl, csrfToken, signal } = options;
  const doFetch = deps.fetch ?? globalThis.fetch;
  const loadFn = deps.loadStartAuthentication ?? loadStartAuthentication;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (csrfToken) headers["x-csrf-token"] = csrfToken;

  const res = await doFetch(optionsUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
    signal,
  });
  if (!res.ok) {
    throw new Error(`passkey options request failed: ${res.status}`);
  }
  const optionsJSON = await res.json();

  const startAuthentication = await loadFn();
  const assertion = await startAuthentication({ optionsJSON }, signal);
  return JSON.stringify(assertion);
}

export interface SubmitPasskeyVerificationOptions {
  /** Endpoint `passkey/verify` do interaction controller (POST de página inteira). */
  verifyUrl: string;
  /** Assertion serializada devolvida por `authenticatePasskey`. */
  assertion: string;
  /** CSRF token enviado no campo `_csrf` do form, quando presente. */
  csrfToken?: string;
}

/**
 * Submete a verificação da passkey como um POST de página inteira. É preciso ser
 * um form real (não um fetch) porque o fluxo de interaction do authkit responde
 * com um redirect que precisa navegar o browser — não é uma resposta Inertia/JSON.
 * SSR-safe: sem `document`, é no-op.
 */
export function submitPasskeyVerification(
  options: SubmitPasskeyVerificationOptions,
): void {
  const { verifyUrl, assertion, csrfToken } = options;
  if (typeof document === "undefined") return;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = verifyUrl;
  form.hidden = true;
  if (csrfToken) form.appendChild(hiddenInput("_csrf", csrfToken));
  form.appendChild(hiddenInput("response", assertion));
  document.body.appendChild(form);
  form.submit();
}

function hiddenInput(name: string, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
}
