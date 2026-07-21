import { test } from '@japa/runner';
import { accountHome } from '../../src/host/account_home.js';

test.group('accountHome', () => {
  test('devolve o default quando o host não configurou accountHome', ({ assert }) => {
    assert.equal(accountHome({}), '/account/security');
  });

  test('devolve o accountHome configurado pelo host', ({ assert }) => {
    assert.equal(accountHome({ accountHome: '/minha-conta' }), '/minha-conta');
  });
});
