/**
 * Cerimônia de passkey (WebAuthn) — a camada de funções (tier mais baixo) do
 * ecossistema de login por passkey. Ambos os hooks (`usePasskeyAutofill` para
 * conditional mediation e `usePasskeyLogin` para o clique explícito) reusam as
 * peças daqui, então a lógica de carregamento da lib e de fetch vive num único
 * lugar.
 *
 * `@simplewebauthn/browser` é uma peer dependency OPCIONAL: importada de forma
 * lazy, do próprio app. Não há fallback de CDN — este pacote é bundleado pelo
 * consumidor, então servir um asset (o que o `authkit-server` faz para as views
 * built-in) não faz sentido aqui, e puxar um terceiro em runtime no caminho de
 * autenticação é pior do que parece: comprometer o CDN é comprometer o login, e
 * a degradação seria silenciosa (nenhum erro de build, só um request externo que
 * ninguém vê). Sem o pacote instalado, a cerimônia falha alto — ver
 * `loadStartAuthentication`.
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

/**
 * Import do peer opcional, isolado numa função só para virar um ponto de injeção:
 * é o único jeito de testar o caminho "pacote ausente" sem depender de ele estar
 * (ou não) instalado no workspace — o `auto-install-peers` do pnpm instala peers
 * opcionais, então "não está lá" não é um estado reproduzível.
 */
async function importWebAuthnBrowser(): Promise<{
  startAuthentication: StartAuthenticationFn;
}> {
  return await import(
    // @ts-ignore — import dinâmico do pacote instalado pelo host (peer opcional).
    '@simplewebauthn/browser' as string
  );
}

/**
 * Carrega `startAuthentication` de forma lazy, do `@simplewebauthn/browser`
 * instalado pelo app. Se o pacote não estiver lá, lança com a instrução exata
 * de instalação em vez de buscar um substituto na rede — o chamador decide o que
 * fazer (o autofill silencia; o login explícito reporta falha).
 *
 * @param importModule Só para teste — chamadores normais omitem.
 */
export async function loadStartAuthentication(
  importModule: typeof importWebAuthnBrowser = importWebAuthnBrowser,
): Promise<StartAuthenticationFn> {
  try {
    const mod = await importModule();
    return mod.startAuthentication;
  } catch (cause) {
    throw new Error(
      '@adonis-agora/authkit-react: o login por passkey requer o pacote ' +
        '`@simplewebauthn/browser`, que não foi encontrado. Instale-o no seu app ' +
        '(`npm i @simplewebauthn/browser@^13`) — ele é uma peer dependency ' +
        'opcional, e não uma dependência direta, porque quem faz o bundle do ' +
        'frontend é o seu app: embutir uma segunda cópia da lib duplicaria o ' +
        'código e brigaria com a versão que você já usa. Este pacote também não ' +
        'cai num CDN público: isso colocaria um terceiro dentro do caminho de ' +
        'autenticação, em silêncio.',
      { cause },
    );
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
    'content-type': 'application/json',
  };
  if (csrfToken) headers['x-csrf-token'] = csrfToken;

  const res = await doFetch(optionsUrl, {
    method: 'POST',
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
export function submitPasskeyVerification(options: SubmitPasskeyVerificationOptions): void {
  const { verifyUrl, assertion, csrfToken } = options;
  if (typeof document === 'undefined') return;

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = verifyUrl;
  form.hidden = true;
  if (csrfToken) form.appendChild(hiddenInput('_csrf', csrfToken));
  form.appendChild(hiddenInput('response', assertion));
  document.body.appendChild(form);
  form.submit();
}

function hiddenInput(name: string, value: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  return input;
}
