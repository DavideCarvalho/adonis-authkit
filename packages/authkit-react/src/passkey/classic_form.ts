/**
 * `submitClassicForm` — submit de FORM CLÁSSICO programático (navegação real).
 *
 * Cria um `<form>` nativo com campos hidden e chama `.submit()`, disparando uma
 * navegação de página inteira. É a peça que hosts com telas React próprias
 * reimplementavam à mão, e existe por um motivo concreto: os fluxos de sudo/passkey
 * do authkit respondem com um **302** que precisa NAVEGAR o browser — um `fetch`
 * não segue esse redirect como navegação (ele resolve a Response, e o app fica
 * com o corpo do 302 na mão). Só um POST de página inteira leva o browser para o
 * destino do redirect.
 *
 * SSR-safe: sem `document` (ou com um `document` não injetado em ambiente sem
 * DOM), é no-op silencioso. O `document` é injetável (segundo parâmetro) só para
 * teste — chamadores normais omitem e usam o `document` global.
 */

/** Opções do submit de form clássico. */
export interface SubmitClassicFormOptions {
  /** URL de destino do POST (o `action` do form). */
  action: string;
  /**
   * Campos hidden a incluir, como `{ nome: valor }`. A ordem de inserção é
   * preservada (ex.: `response` antes de `_csrf`/`return_to`).
   */
  fields: Record<string, string>;
  /** Método HTTP do form. Default `'POST'` — os fluxos de sudo/passkey são todos POST. */
  method?: string;
}

/** Dependências injetáveis — só para teste (mock de `document`). */
export interface SubmitClassicFormDeps {
  document?: Document;
}

/**
 * Monta um `<form>` clássico com os campos hidden e o submete (navegação real).
 *
 * @example
 * submitClassicForm({
 *   action: '/account/confirm/passkey',
 *   fields: { response: assertion, _csrf: csrfToken, return_to: '/account/security' },
 * })
 */
export function submitClassicForm(
  options: SubmitClassicFormOptions,
  deps: SubmitClassicFormDeps = {},
): void {
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : undefined);
  if (!doc) return; // SSR / ambiente sem DOM → no-op.

  const form = doc.createElement('form');
  form.method = options.method ?? 'POST';
  form.action = options.action;
  form.hidden = true;

  for (const [name, value] of Object.entries(options.fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  doc.body.appendChild(form);
  form.submit();
}
