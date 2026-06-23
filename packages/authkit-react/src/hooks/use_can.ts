import { useEffect, useState } from "react";
import { useAuthkitConfig } from "../config.js";
import { jsonRequest } from "./use_resource.js";

/** Resultado do hook `useCan`. */
export interface UseCanResult {
  /** `true` se a Authz autorizou a permissão sobre o recurso. */
  allowed: boolean;
  /** `true` enquanto a checagem está em voo. */
  loading: boolean;
}

/** Resposta do contrato fixo `POST <canPath>` -> `{ allowed }`. */
interface CanResponse {
  allowed: boolean;
}

/** Chave de cache estável por (path, permission, resource). */
function cacheKey(path: string, permission: string, resource?: string): string {
  return [path, permission, resource ?? ""].join("|");
}

/**
 * Cache/dedupe em memória, por processo, das checagens de permissão.
 * - `resolved`: respostas já obtidas (`allowed`).
 * - `inflight`: promessas em voo para deduplicar requests concorrentes.
 *
 * Exportado para testes; em runtime é detalhe interno do `useCan`.
 */
export const canCache = {
  resolved: new Map<string, boolean>(),
  inflight: new Map<string, Promise<boolean>>(),
  clear() {
    this.resolved.clear();
    this.inflight.clear();
  },
};

/**
 * Consulta o endpoint da Authz `POST <path>` com `{ permission, resource? }`
 * (credenciais/cookies incluídos) e devolve `allowed`. Deduplica requests
 * concorrentes e memoiza o resultado por (path, permission, resource).
 *
 * Pura quanto a React (sem hooks): testável diretamente com um `fetch` mockado.
 */
export async function checkCan(
  path: string,
  permission: string,
  resource?: string,
  csrfToken?: string,
): Promise<boolean> {
  const key = cacheKey(path, permission, resource);
  const cached = canCache.resolved.get(key);
  if (cached !== undefined) return cached;
  const pending = canCache.inflight.get(key);
  if (pending) return pending;

  const promise = jsonRequest<CanResponse>(path, {
    method: "POST",
    csrfToken,
    body: JSON.stringify({ permission, ...(resource ? { resource } : {}) }),
  })
    .then((res) => {
      const allowed = res?.allowed === true;
      canCache.resolved.set(key, allowed);
      return allowed;
    })
    .finally(() => {
      canCache.inflight.delete(key);
    });

  canCache.inflight.set(key, promise);
  return promise;
}

/**
 * Gateia em uma permissão de DB da Authz (não em papéis globais — para esses
 * use `<Can>`/`useAuth`). Consulta `POST <canPath>` (default `/authz/can`,
 * configurável via `AuthkitProvider`) e devolve `{ allowed, loading }`, com
 * cache/dedupe em memória por (permission, resource).
 */
export function useCan(permission: string, resource?: string): UseCanResult {
  const config = useAuthkitConfig();
  const path = config.endpoints.can;
  const key = cacheKey(path, permission, resource);

  const [state, setState] = useState<UseCanResult>(() => {
    const cached = canCache.resolved.get(key);
    return cached !== undefined
      ? { allowed: cached, loading: false }
      : { allowed: false, loading: true };
  });

  useEffect(() => {
    let cancelled = false;
    const hit = canCache.resolved.get(key);
    if (hit !== undefined) {
      setState({ allowed: hit, loading: false });
      return;
    }
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    checkCan(path, permission, resource, config.csrfToken)
      .then((allowed) => {
        if (!cancelled) setState({ allowed, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ allowed: false, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key, path, permission, resource, config.csrfToken]);

  return state;
}
