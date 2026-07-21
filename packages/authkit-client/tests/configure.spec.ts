import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@japa/runner';

test.group('configure stubs', () => {
  test('stubsRoot resolve e os .stub existem no build', async ({ assert }) => {
    const { stubsRoot } = await import('../build/stubs/main.js');
    assert.isTrue(existsSync(join(stubsRoot, 'config/authkit_client.stub')));
    assert.isTrue(existsSync(join(stubsRoot, 'controllers/oidc_session_controller.stub')));
  });
});
