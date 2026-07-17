/**
 * usePasskeyLogin — hook headless para o login por passkey disparado por clique.
 *
 * Encapsula a cerimônia inteira que os apps escreviam à mão: POST das options →
 * `startAuthentication` → POST de página inteira no `verifyUrl`. O app é dono do
 * visual do botão; o hook é dono da lógica e do estado (`busy`/`failed`).
 *
 * Meio-do-caminho: passe `onSuccess` para receber a assertion e submeter você
 * mesmo (igual ao `usePasskeyAutofill`); sem ele, o hook faz o submit de página
 * inteira no `verifyUrl`.
 */

import { useCallback, useState } from "react";
import {
  authenticatePasskey,
  submitPasskeyVerification,
} from "../passkey/authenticate.js";

export interface UsePasskeyLoginOptions {
  /** Endpoint `passkey/options` do interaction controller (POST). */
  optionsUrl: string;
  /** Endpoint `passkey/verify` do interaction controller (POST de página inteira). */
  verifyUrl: string;
  /** CSRF token: header `x-csrf-token` no options e campo `_csrf` no verify. */
  csrfToken?: string;
  /**
   * Se fornecido, recebe a assertion serializada e o hook NÃO submete — você
   * controla a verificação. Sem ele, o hook faz o submit de página inteira.
   */
  onSuccess?: (assertion: string) => void;
}

export interface UsePasskeyLoginResult {
  /** Dispara a cerimônia. Fail-safe: erro/abort marca `failed` e reabilita. */
  authenticate: () => Promise<void>;
  /** `true` enquanto a cerimônia está em andamento. */
  busy: boolean;
  /** `true` se a última tentativa falhou (reseta ao tentar de novo). */
  failed: boolean;
}

/**
 * Hook headless de login por passkey. Retorna `{ authenticate, busy, failed }`.
 */
export function usePasskeyLogin(
  options: UsePasskeyLoginOptions,
): UsePasskeyLoginResult {
  const { optionsUrl, verifyUrl, csrfToken, onSuccess } = options;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const authenticate = useCallback(async () => {
    setFailed(false);
    setBusy(true);
    try {
      const assertion = await authenticatePasskey({ optionsUrl, csrfToken });
      if (onSuccess) {
        onSuccess(assertion);
        setBusy(false);
        return;
      }
      // Submit de página inteira: a navegação leva a página embora, então NÃO
      // resetamos `busy` (o botão fica desabilitado até o redirect).
      submitPasskeyVerification({ verifyUrl, assertion, csrfToken });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }, [optionsUrl, verifyUrl, csrfToken, onSuccess]);

  return { authenticate, busy, failed };
}
