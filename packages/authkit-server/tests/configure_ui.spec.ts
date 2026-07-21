import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@japa/runner';
import { resolveUiPreset, uiStubPaths } from '../commands/ui_preset.js';

test.group('ui preset', () => {
  test('default é edge quando nada é passado', ({ assert }) => {
    assert.equal(resolveUiPreset(undefined), 'edge');
  });
  test('aceita headless|edge|react', ({ assert }) => {
    assert.equal(resolveUiPreset('react'), 'react');
    assert.equal(resolveUiPreset('headless'), 'headless');
    assert.equal(resolveUiPreset('edge'), 'edge');
  });
  test('preset inválido lança', ({ assert }) => {
    assert.throws(() => resolveUiPreset('vue'), /ui inválido/);
  });
  test('uiStubPaths: headless não scaffolda nada (controllers são da lib)', ({ assert }) => {
    assert.deepEqual(uiStubPaths('headless'), []);
  });
  test('uiStubPaths: edge não scaffolda nada (views montadas via disco authkit::)', ({
    assert,
  }) => {
    assert.deepEqual(uiStubPaths('edge'), []);
  });
  test('uiStubPaths: react scaffolda 11 arquivos (10 páginas + auth_shell)', ({ assert }) => {
    const paths = uiStubPaths('react');
    assert.isAbove(paths.filter((p) => p.endsWith('.tsx')).length, 0);
    assert.include(paths, 'ui/react/components/auth_shell.tsx');
    assert.include(paths, 'ui/react/pages/login.tsx');
    assert.include(paths, 'ui/react/pages/consent.tsx');
    assert.include(paths, 'ui/react/pages/signup.tsx');
    assert.include(paths, 'ui/react/pages/forgot.tsx');
    assert.include(paths, 'ui/react/pages/reset.tsx');
    assert.include(paths, 'ui/react/pages/verify-email.tsx');
    assert.include(paths, 'ui/react/pages/mfa-challenge.tsx');
    assert.include(paths, 'ui/react/pages/account/login.tsx');
    assert.include(paths, 'ui/react/pages/account/tokens.tsx');
    assert.include(paths, 'ui/react/pages/account/mfa.tsx');
    assert.lengthOf(paths, 11);
  });
  test('uiStubPaths: react não inclui stubs de controller', ({ assert }) => {
    const paths = uiStubPaths('react');
    assert.notInclude(paths, 'ui/react/auth_interaction_controller.stub');
  });

  // ─── stub de config react ──────────────────────────────────────────────────

  test('stub authkit_react inclui inertiaRenderer com allowlist views no build', async ({
    assert,
  }) => {
    const { stubsRoot } = await import('../build/stubs/main.js');
    assert.isTrue(existsSync(join(stubsRoot, 'config/authkit_react.stub')));
    const content = readFileSync(join(stubsRoot, 'config/authkit_react.stub'), 'utf8');
    // Deve conter o renderer com a option views.
    assert.include(content, 'inertiaRenderer');
    assert.include(content, 'views:');
    // Deve listar as 10 páginas geradas pelo scaffold.
    const expectedViews = [
      "'login'",
      "'consent'",
      "'signup'",
      "'forgot'",
      "'reset'",
      "'verify-email'",
      "'mfa-challenge'",
      "'account/login'",
      "'account/tokens'",
      "'account/mfa'",
    ];
    for (const v of expectedViews) {
      assert.include(content, v, `stub deve listar a view ${v}`);
    }
    // NÃO deve listar views admin/* (são sempre edge, não vai no allowlist).
    assert.notInclude(content, "'admin/");
  });
});
