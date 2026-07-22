/**
 * usePasskeyRegistration — hook headless para o "dance" de REGISTRO de passkey
 * por form clássico. O par de `usePasskeyAssertion`, com `startRegistration`.
 * Zero UI: o host é dono do botão; o hook é dono da cerimônia e do estado.
 *
 * POST das options (`x-csrf-token`) → `startRegistration` → submit do `response`
 * num FORM CLÁSSICO (com `_csrf` e `return_to`). O endpoint de registro
 * (`account/mfa/passkeys/verify`) responde 302 numa navegação, então precisa ser
 * um POST de página inteira.
 *
 * @example
 * ```tsx
 * // Página Inertia de MFA (account/mfa) — adicionar passkey:
 * function AddPasskey({ csrfToken }: AccountMfaProps) {
 *   const { run, running, error } = usePasskeyRegistration({
 *     optionsUrl: '/account/mfa/passkeys/options',
 *     actionUrl: '/account/mfa/passkeys/verify',
 *     csrfToken,
 *   })
 *   return (
 *     <>
 *       <button type="button" onClick={run} disabled={running}>
 *         {running ? 'Registrando…' : 'Adicionar passkey'}
 *       </button>
 *       {error && <p role="alert">Não foi possível registrar. Tente de novo.</p>}
 *     </>
 *   )
 * }
 * ```
 */

import { useCallback, useState } from 'react';
import { runPasskeyRegistration } from '../passkey/sudo.js';

export interface UsePasskeyRegistrationOptions {
  /** Endpoint de options de registro (POST). Ex.: `account/mfa/passkeys/options`. */
  optionsUrl: string;
  /** Endpoint de verificação (POST de página inteira). Ex.: `account/mfa/passkeys/verify`. */
  actionUrl: string;
  /** CSRF token: header `x-csrf-token` no options e campo `_csrf` no form. */
  csrfToken?: string;
  /** Destino pós-redirect: vai como campo `return_to` do form quando fornecido. */
  returnTo?: string | null;
}

export interface UsePasskeyRegistrationResult {
  /** Dispara o dance. Fail-safe: erro no options marca `error` e reabilita. */
  run: () => Promise<void>;
  /** `true` enquanto a cerimônia + navegação estão em andamento. */
  running: boolean;
  /** Erro da última tentativa (ex.: options 4xx) ou `null`. Reseta ao rodar de novo. */
  error: Error | null;
}

/**
 * Hook headless de registro de passkey. Retorna `{ run, running, error }`.
 */
export function usePasskeyRegistration(
  options: UsePasskeyRegistrationOptions,
): UsePasskeyRegistrationResult {
  const { optionsUrl, actionUrl, csrfToken, returnTo } = options;
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      await runPasskeyRegistration({ optionsUrl, actionUrl, csrfToken, returnTo });
      // Sucesso = submit de página inteira: a navegação leva a página embora, então
      // NÃO resetamos `running` (o botão fica desabilitado até o redirect).
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setRunning(false);
    }
  }, [optionsUrl, actionUrl, csrfToken, returnTo]);

  return { run, running, error };
}
