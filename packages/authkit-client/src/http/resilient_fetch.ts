/**
 * Helper interno para as chamadas HTTP de saída do authkit-client (OIDC
 * discovery, JWKS e token endpoints).
 *
 * Por padrão é um passthrough puro de `fetch` — ZERO mudança de comportamento.
 * Quando uma {@link ResiliencePolicy} é fornecida (via config do client), a
 * chamada `fetch` roda dentro de `policy.execute(() => fetch(...))`, ganhando
 * timeout/retry/circuit-breaker conforme a política composta.
 *
 * A política é tipada ESTRUTURALMENTE de propósito: o authkit-client NÃO importa
 * `@adonis-agora/resilience` em runtime. O consumidor passa o resultado de
 * `wrap(...)` (de @adonis-agora/resilience) e o duck-typing casa com a interface.
 */

/**
 * Forma estrutural de uma política de resiliência composta — exatamente o que
 * `wrap(...)` de `@adonis-agora/resilience` retorna. Tipada aqui para evitar um
 * hard-import do pacote de resiliência.
 */
export interface ResiliencePolicy {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * `fetch` envolvido por uma política de resiliência OPCIONAL.
 *
 * - Sem `policy`: chama `fetch(input, init)` diretamente (passthrough).
 * - Com `policy`: roda `policy.execute(() => fetch(input, init))`.
 *
 * `fetchImpl` permite injetar um fetch fake nos testes.
 */
export function resilientFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
  policy?: ResiliencePolicy,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!policy) return fetchImpl(input, init);
  return policy.execute(() => fetchImpl(input, init));
}
