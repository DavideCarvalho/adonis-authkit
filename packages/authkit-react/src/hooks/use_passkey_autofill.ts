/**
 * usePasskeyAutofill — WebAuthn conditional mediation (autofill) hook.
 *
 * Permite que telas de login customizadas dos hosts (que não usam o login.edge
 * built-in) ativem o autofill de passkey no campo de e-mail, disparando o fluxo
 * de authenticação discoverable assim que o usuário selecionar uma sugestão do
 * browser.
 *
 * Fail-safe total:
 *   - SSR-safe: não executa fora do browser.
 *   - Browser sem suporte ao WebAuthn / conditional mediation → silêncio.
 *   - Qualquer erro/abort → silêncio (login normal segue).
 *   - AbortController: aborta automaticamente no unmount do componente.
 *
 * Uso:
 * ```tsx
 * usePasskeyAutofill({
 *   optionsUrl: '/auth/interaction/:uid/passkey/options',
 *   verifyUrl: '/auth/interaction/:uid/passkey/verify',
 *   onSuccess: (assertion) => { ... }, // navega / submete form
 * })
 * ```
 *
 * O hook é exportado do pacote principal `@dudousxd/adonis-authkit-react`.
 */

import { useEffect, useRef } from 'react'

export interface UsePasskeyAutofillOptions {
  /**
   * URL para obter as options de autenticação (POST).
   * Deve ser o endpoint `passkey/options` do interaction controller,
   * configurado para retornar options discoverable (allowCredentials vazio).
   */
  optionsUrl: string
  /**
   * URL para verificar a assertion de autenticação (POST, form).
   * O hook passa a assertion serializada em JSON.
   */
  verifyUrl: string
  /**
   * Callback chamado em caso de sucesso com a assertion bruta.
   * O host decide como submeter (ex.: form submit, fetch, navigate).
   * @param assertion - JSON.stringify da PublicKeyCredential assertion.
   */
  onSuccess: (assertion: string) => void
  /**
   * CSRF token a enviar nos headers (X-CSRF-TOKEN) quando opcional.
   * Quando ausente, o fetch não inclui o header.
   */
  csrfToken?: string
  /**
   * Se false, o hook NÃO roda mesmo com suporte disponível.
   * Default: true. Útil quando a setting passkeyAutofill está off.
   */
  enabled?: boolean
}

/**
 * Hook SSR-safe para WebAuthn conditional mediation (passkey autofill).
 *
 * Monta a cerimônia de autenticação discoverable no carregamento do componente
 * e a aborta automaticamente no unmount. O browser apresenta as passkeys
 * disponíveis diretamente no campo que tem `autocomplete="username webauthn"`.
 */
export function usePasskeyAutofill(options: UsePasskeyAutofillOptions): void {
  const { optionsUrl, verifyUrl, onSuccess, csrfToken, enabled = true } = options
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled) return
    // SSR guard
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return
    if (!window.PublicKeyCredential) return

    let cancelled = false
    const ac = new AbortController()
    abortRef.current = ac

    const run = async () => {
      try {
        // 1. Detecta suporte a conditional mediation.
        const supported =
          typeof (PublicKeyCredential as any).isConditionalMediationAvailable === 'function'
            ? await (PublicKeyCredential as any).isConditionalMediationAvailable()
            : false
        if (!supported || cancelled) return

        // 2. Importa @simplewebauthn/browser de forma lazy (não é dep obrigatória).
        let startAuthentication: ((opts: any, signal?: AbortSignal) => Promise<any>) | undefined
        try {
          const mod = await import(
            // @ts-ignore — dynamic import de CDN ou pacote instalado pelo host.
            '@simplewebauthn/browser' as string
          )
          startAuthentication = mod.startAuthentication
        } catch {
          // Fallback: tenta CDN (mesmo que o login.edge usa).
          try {
            const mod = await import(
              // @ts-ignore
              'https://cdn.jsdelivr.net/npm/@simplewebauthn/browser@13/dist/bundle/index.js' as string
            )
            startAuthentication = mod.startAuthentication
          } catch {
            return // Sem biblioteca = sem autofill.
          }
        }
        if (!startAuthentication || cancelled) return

        // 3. Obtém as options discoverable do servidor.
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (csrfToken) headers['x-csrf-token'] = csrfToken

        const optRes = await fetch(optionsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
          signal: ac.signal,
        })
        if (!optRes.ok || cancelled) return
        const optionsJSON = await optRes.json()
        // Remove flag interna (_discoverable) antes de passar ao browser.
        delete optionsJSON._discoverable
        if (cancelled) return

        // 4. Inicia conditional mediation — o browser bloqueia aqui até o usuário
        //    selecionar uma passkey (ou o AbortController ser disparado).
        const assertion = await startAuthentication(
          { optionsJSON, useBrowserAutofill: true, verifyBrowserAutofillInput: true },
          ac.signal
        )
        if (cancelled) return

        // 5. Sucesso: entrega a assertion serializada ao callback do host.
        onSuccess(JSON.stringify(assertion))
      } catch {
        // Fail-safe: abort, suporte ausente, erro de rede ou qualquer outra falha
        // → silêncio. O login normal (senha/passkey manual) continua disponível.
      }
    }

    void run()

    return () => {
      cancelled = true
      ac.abort()
      abortRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, optionsUrl, verifyUrl, csrfToken])
}
