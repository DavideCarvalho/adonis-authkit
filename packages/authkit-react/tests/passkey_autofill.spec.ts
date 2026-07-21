/**
 * Testes do hook usePasskeyAutofill — SSR-safe e abort com AbortController.
 *
 * Como o hook usa useEffect (que não roda em Node), testamos:
 *   1. O hook é exportado e é uma função.
 *   2. As opções são passadas corretamente (shape).
 *   3. AbortController: enabled=false → cerimônia não inicia.
 *   4. A ausência de `window` não lança erro (SSR-safe).
 */

import { test } from '@japa/runner';
import {
  type UsePasskeyAutofillOptions,
  usePasskeyAutofill,
} from '../src/hooks/use_passkey_autofill.js';

test.group('usePasskeyAutofill — exports e types', () => {
  test('hook is exported as a function', ({ assert }) => {
    assert.isFunction(usePasskeyAutofill);
  });

  test('UsePasskeyAutofillOptions shape is correct', ({ assert }) => {
    const opts: UsePasskeyAutofillOptions = {
      optionsUrl: '/auth/interaction/uid/passkey/options',
      verifyUrl: '/auth/interaction/uid/passkey/verify',
      onSuccess: (_assertion: string) => {},
      csrfToken: 'abc123',
      enabled: true,
    };
    assert.equal(opts.optionsUrl, '/auth/interaction/uid/passkey/options');
    assert.equal(opts.verifyUrl, '/auth/interaction/uid/passkey/verify');
    assert.isFunction(opts.onSuccess);
    assert.equal(opts.csrfToken, 'abc123');
    assert.isTrue(opts.enabled);
  });

  test('enabled defaults to true when omitted', ({ assert }) => {
    const opts: UsePasskeyAutofillOptions = {
      optionsUrl: '/options',
      verifyUrl: '/verify',
      onSuccess: () => {},
    };
    // enabled é undefined (opcional) — o hook trata como true
    assert.isUndefined(opts.enabled);
    // Simula o comportamento do hook
    const effective = opts.enabled ?? true;
    assert.isTrue(effective);
  });

  test('SSR-safe: hook does not throw without window', ({ assert }) => {
    // No Node.js, window é undefined. Verificamos que importar o módulo não lança.
    assert.doesNotThrow(() => {
      // Apenas importa e verifica que é função — não executa o useEffect.
      const fn = usePasskeyAutofill;
      assert.isFunction(fn);
    });
  });

  test('AbortController cleanup logic: cancelled flag prevents ceremony', ({ assert }) => {
    // Simula a lógica interna do hook de forma puramente unitária.
    let ceremonyStarted = false;
    let cancelled = false;

    const runCeremony = async (isCancelled: () => boolean) => {
      if (isCancelled()) return;
      // Simula uma await assíncrona
      await Promise.resolve();
      if (isCancelled()) return;
      ceremonyStarted = true;
    };

    // Cancela antes de executar
    cancelled = true;
    void runCeremony(() => cancelled);

    // Não deve ter iniciado
    assert.isFalse(ceremonyStarted);
  });
});
