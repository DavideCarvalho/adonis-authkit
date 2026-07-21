import { createHash } from 'node:crypto';

/**
 * Checagem de senha vazada via HaveIBeenPwned Pwned Passwords (Range API), com
 * k-anonymity: NUNCA enviamos a senha nem o hash completo — só os 5 primeiros
 * hex chars do SHA-1, e procuramos o sufixo localmente na resposta.
 *
 * FAIL-SAFE por design: qualquer erro (rede, timeout, 5xx, parsing) resulta em
 * "não vazada" (permite a senha) e loga um warning. A indisponibilidade do
 * serviço externo NUNCA deve bloquear o usuário de definir uma senha.
 */

/** Logger mínimo (subconjunto do logger do AdonisJS). */
export interface PwnedLogger {
  warn(obj: unknown, msg?: string): void;
}

/**
 * Cliente HTTP injetável (fetch nativo por default). Existe para testes: permite
 * simular hit/miss/erro/timeout SEM rede. A assinatura espelha o `fetch` global.
 */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

let fetchImpl: FetchLike | undefined;

/** Injeta um fetch fake para testes. `undefined` restaura o fetch nativo. */
export function __setFetchForTests(impl: FetchLike | undefined): void {
  fetchImpl = impl;
}

function getFetch(): FetchLike {
  if (fetchImpl) return fetchImpl;
  return globalThis.fetch as unknown as FetchLike;
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Retorna `true` se a senha aparece na base do HIBP, `false` caso contrário OU
 * em qualquer falha (fail-safe). `timeoutMs` aborta a request.
 */
export async function isPasswordPwned(
  password: string,
  options: { timeoutMs: number; logger?: PwnedLogger; fetchImpl?: FetchLike } = {
    timeoutMs: 2000,
  },
): Promise<boolean> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const doFetch = options.fetchImpl ?? getFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const res = await doFetch(`${HIBP_RANGE_URL}${prefix}`, {
      signal: controller.signal,
      // Add-Padding obscurece o tamanho da resposta (k-anonymity reforçado).
      headers: { 'Add-Padding': 'true' },
    });
    if (!res.ok) {
      options.logger?.warn(
        { status: res.status },
        'authkit: HIBP range API returned a non-OK status — skipping pwned check (fail-safe).',
      );
      return false;
    }
    const body = await res.text();
    // Cada linha: "<SUFIXO>:<count>". Linhas de padding têm count 0 — ignoradas.
    for (const line of body.split('\n')) {
      const [candidate, countStr] = line.trim().split(':');
      if (candidate === suffix && Number(countStr) > 0) return true;
    }
    return false;
  } catch (error) {
    options.logger?.warn(
      { err: error },
      'authkit: HIBP range API request failed (network/timeout) — skipping pwned check (fail-safe).',
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
