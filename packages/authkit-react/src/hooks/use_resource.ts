import { useCallback, useEffect, useState } from 'react';

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Faz uma requisição JSON com credenciais e header CSRF opcional.
 * Lança `Error` em status não-2xx. SSR-safe (só roda quando chamado).
 */
export async function jsonRequest<T>(
  url: string,
  init: RequestInit & { csrfToken?: string } = {},
): Promise<T> {
  const { csrfToken, headers, ...rest } = init;
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
      ...headers,
    },
    ...rest,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.message === 'string') message = body.message;
    } catch {
      /* corpo não-JSON; mantém a mensagem padrão */
    }
    throw new Error(message);
  }
  // 204/empty
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Hook genérico que carrega um recurso JSON via GET com estado
 * `{ data, loading, error }` + `refetch`. Usa plain useState/useEffect
 * (sem react-query). SSR-safe: só busca no efeito (client-side).
 */
export function useResource<T>(
  url: string,
  csrfToken?: string,
): ResourceState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await jsonRequest<T>(url, { csrfToken });
      setState({ data, loading: false, error: null });
    } catch (err) {
      setState({ data: null, loading: false, error: err as Error });
    }
  }, [url, csrfToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}
