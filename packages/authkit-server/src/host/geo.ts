/**
 * Resolução de geolocalização PLUGÁVEL e FAIL-SAFE para o IP de uma sessão.
 *
 * A lib NÃO embute nenhum banco de geo (MaxMind/ipapi/etc.) — o host pluga o
 * `resolveGeo` na config (ex.: lookup MaxMind local ou um fetch a um serviço). O
 * default (hook ausente) é NÃO mostrar geo (só o IP). A resolução é best-effort
 * com timeout curto: erro/timeout → `null` (a UI só omite a localização).
 */

/**
 * Hook do host que mapeia um IP para um rótulo de localização legível
 * (ex.: "São Paulo, BR"). Recebe o IP e devolve a string OU `null` quando não
 * resolve. Pode ser síncrono ou assíncrono.
 */
export type ResolveGeo = (ip: string) => Promise<string | null> | (string | null);

/** Timeout default (ms) da resolução de geo — curto para não atrasar listagens. */
export const GEO_RESOLVE_TIMEOUT_MS = 1500;

/**
 * Aplica o `resolveGeo` do host a um IP de forma defensiva: sem hook, sem IP, ou
 * erro/timeout → `null`. NUNCA lança. O timeout evita que um lookup lento
 * (ex.: rede) trave a renderização da lista de sessões.
 */
export async function resolveGeoSafe(
  resolveGeo: ResolveGeo | undefined,
  ip: string | null | undefined,
  timeoutMs: number = GEO_RESOLVE_TIMEOUT_MS,
): Promise<string | null> {
  if (!resolveGeo || !ip) return null;
  try {
    const result = await withTimeout(Promise.resolve(resolveGeo(ip)), timeoutMs);
    return typeof result === 'string' && result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

/** Rejeita após `ms` se a promise não resolver antes (limpa o timer ao fim). */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('geo resolve timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
