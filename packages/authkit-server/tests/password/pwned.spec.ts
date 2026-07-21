import { createHash } from 'node:crypto';
import { test } from '@japa/runner';
import { type FetchLike, isPasswordPwned } from '../../src/password/pwned.js';

/** SHA-1 sufixo (depois dos 5 primeiros hex) de uma senha, no formato da API. */
function suffixOf(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase().slice(5);
}

/** fetch fake que devolve um corpo fixo (lista de sufixos:count). */
function fakeFetch(body: string, status = 200): FetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

test.group('isPasswordPwned', () => {
  test('hit: o sufixo está na resposta com count > 0 → true', async ({ assert }) => {
    const suffix = suffixOf('password123');
    const body = `0000000000000000000000000000000000A:1\n${suffix}:42\n`;
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 1000,
      fetchImpl: fakeFetch(body),
    });
    assert.isTrue(pwned);
  });

  test('miss: o sufixo não está na resposta → false', async ({ assert }) => {
    const body = 'ABCDEF0000000000000000000000000000A:1\nFFFFFF0000000000000000000000000000B:2\n';
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 1000,
      fetchImpl: fakeFetch(body),
    });
    assert.isFalse(pwned);
  });

  test('padding: sufixo presente mas count 0 → false', async ({ assert }) => {
    const suffix = suffixOf('password123');
    const body = `${suffix}:0\n`;
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 1000,
      fetchImpl: fakeFetch(body),
    });
    assert.isFalse(pwned);
  });

  test('fail-safe: HTTP 5xx → false + warn logado', async ({ assert }) => {
    const warns: unknown[] = [];
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 1000,
      fetchImpl: fakeFetch('', 503),
      logger: { warn: (obj) => warns.push(obj) },
    });
    assert.isFalse(pwned);
    assert.lengthOf(warns, 1);
  });

  test('fail-safe: erro de rede → false + warn logado', async ({ assert }) => {
    const warns: unknown[] = [];
    const throwingFetch: FetchLike = async () => {
      throw new Error('network down');
    };
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 1000,
      fetchImpl: throwingFetch,
      logger: { warn: (obj) => warns.push(obj) },
    });
    assert.isFalse(pwned);
    assert.lengthOf(warns, 1);
  });

  test('fail-safe: timeout (abort) → false', async ({ assert }) => {
    // fetch que respeita o AbortSignal: rejeita quando abortado.
    const abortingFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const pwned = await isPasswordPwned('password123', {
      timeoutMs: 10,
      fetchImpl: abortingFetch,
    });
    assert.isFalse(pwned);
  });

  test('k-anonymity: envia só o prefixo de 5 chars + header Add-Padding', async ({ assert }) => {
    let calledUrl = '';
    let calledHeaders: Record<string, string> | undefined;
    const spyFetch: FetchLike = async (url, init) => {
      calledUrl = url;
      calledHeaders = init?.headers;
      return { ok: true, status: 200, text: async () => '' };
    };
    await isPasswordPwned('password123', { timeoutMs: 1000, fetchImpl: spyFetch });
    // CBFDA é o prefixo (5 chars) do SHA-1 de "password123".
    assert.isTrue(calledUrl.endsWith('/range/CBFDA'));
    assert.equal(calledHeaders?.['Add-Padding'], 'true');
  });
});
