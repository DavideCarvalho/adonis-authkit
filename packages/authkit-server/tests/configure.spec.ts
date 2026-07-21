import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@japa/runner';

test.group('configure stubs', () => {
  test('stubsRoot resolve e os .stub existem no build', async ({ assert }) => {
    // depois de `pnpm build`, os stubs são copiados para build/stubs
    const { stubsRoot } = await import('../build/stubs/main.js');
    assert.isTrue(existsSync(join(stubsRoot, 'config/authkit.stub')));
    assert.isTrue(existsSync(join(stubsRoot, 'models/auth_user.stub')));
  });

  test('stubs React (páginas + auth_shell) existem no build', async ({ assert }) => {
    const { stubsRoot } = await import('../build/stubs/main.js');
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/components/auth_shell.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/login.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/consent.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/signup.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/forgot.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/reset.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/account/login.tsx')));
    assert.isTrue(existsSync(join(stubsRoot, 'ui/react/pages/account/tokens.tsx')));
  });
});
