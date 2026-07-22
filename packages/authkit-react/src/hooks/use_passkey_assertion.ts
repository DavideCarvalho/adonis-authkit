/**
 * usePasskeyAssertion — hook headless para o "dance" de sudo por passkey
 * (confirmar identidade). Zero UI: o host é dono do botão; o hook é dono da
 * cerimônia e do estado (`running`/`error`).
 *
 * Encapsula o que telas React próprias reimplementavam à mão: POST das options
 * (`x-csrf-token`) → `startAuthentication` → submit do `response` num FORM
 * CLÁSSICO (com `_csrf` e `return_to`), porque o endpoint de sudo responde 302 e
 * um fetch não navega.
 *
 * @example
 * ```tsx
 * // Página Inertia de confirmação (sudo) — método `webauthn`:
 * function ConfirmPasskey({ csrfToken, returnTo }: AccountConfirmProps & { ... }) {
 *   const { run, running, error } = usePasskeyAssertion({
 *     optionsUrl: '/account/confirm/passkey/options',
 *     actionUrl: '/account/confirm/passkey',
 *     csrfToken,
 *     returnTo,
 *   })
 *   return (
 *     <>
 *       <button type="button" onClick={run} disabled={running}>
 *         {running ? 'Confirmando…' : 'Confirmar com passkey'}
 *       </button>
 *       {error && <p role="alert">Não foi possível confirmar. Tente de novo.</p>}
 *     </>
 *   )
 * }
 * ```
 */

import { useCallback, useState } from 'react';
import { runPasskeyAssertion } from '../passkey/sudo.js';

export interface UsePasskeyAssertionOptions {
  /** Endpoint de options da assertion (POST). Ex.: `account/confirm/passkey/options`. */
  optionsUrl: string;
  /** Endpoint de verificação (POST de página inteira). Ex.: `account/confirm/passkey`. */
  actionUrl: string;
  /** CSRF token: header `x-csrf-token` no options e campo `_csrf` no form. */
  csrfToken?: string;
  /** Destino pós-redirect: vai como campo `return_to` do form quando fornecido. */
  returnTo?: string | null;
}

export interface UsePasskeyAssertionResult {
  /** Dispara o dance. Fail-safe: erro no options marca `error` e reabilita. */
  run: () => Promise<void>;
  /** `true` enquanto a cerimônia + navegação estão em andamento. */
  running: boolean;
  /** Erro da última tentativa (ex.: options 4xx) ou `null`. Reseta ao rodar de novo. */
  error: Error | null;
}

/**
 * Hook headless de assertion por passkey (sudo). Retorna `{ run, running, error }`.
 */
export function usePasskeyAssertion(
  options: UsePasskeyAssertionOptions,
): UsePasskeyAssertionResult {
  const { optionsUrl, actionUrl, csrfToken, returnTo } = options;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      await runPasskeyAssertion({ optionsUrl, actionUrl, csrfToken, returnTo });
      // Sucesso = submit de página inteira: a navegação leva a página embora, então
      // NÃO resetamos `running` (o botão fica desabilitado até o redirect).
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setRunning(false);
    }
  }, [optionsUrl, actionUrl, csrfToken, returnTo]);

  return { run, running, error };
}
