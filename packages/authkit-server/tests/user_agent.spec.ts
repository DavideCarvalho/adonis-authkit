import { test } from '@japa/runner';
import { parseUserAgent } from '../src/host/user_agent.js';

test.group('parseUserAgent (parser mínimo embutido)', () => {
  test('Chrome no Windows', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Chrome', os: 'Windows' });
  });

  test('Firefox no Linux', ({ assert }) => {
    const ua = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Firefox', os: 'Linux' });
  });

  test('Safari no macOS', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Safari', os: 'macOS' });
  });

  test('Edge (Chromium) detectado antes de Chrome', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Edge', os: 'Windows' });
  });

  test('Opera (OPR) detectado antes de Chrome', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Opera', os: 'Windows' });
  });

  test('Chrome no Android (Android antes de Linux)', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Chrome', os: 'Android' });
  });

  test('Safari no iOS (iOS antes de macOS)', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Safari', os: 'iOS' });
  });

  test('Chrome no iOS (CriOS)', ({ assert }) => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    assert.deepEqual(parseUserAgent(ua), { browser: 'Chrome', os: 'iOS' });
  });

  test('string desconhecida → Unknown/Unknown', ({ assert }) => {
    assert.deepEqual(parseUserAgent('curl/8.4.0'), { browser: 'Unknown', os: 'Unknown' });
  });

  test('null/vazio → Unknown/Unknown', ({ assert }) => {
    assert.deepEqual(parseUserAgent(null), { browser: 'Unknown', os: 'Unknown' });
    assert.deepEqual(parseUserAgent(undefined), { browser: 'Unknown', os: 'Unknown' });
    assert.deepEqual(parseUserAgent(''), { browser: 'Unknown', os: 'Unknown' });
  });
});
