/**
 * Testes dos hooks de organização e estrutura dos componentes.
 * Os componentes que usam `useAuth()` não podem ser testados via SSR puro porque
 * `usePage` do Inertia lança fora do contexto Inertia. Testamos em vez disso:
 * 1. Os hooks puros (useOrgInvitations, useOrganizations via tipo/exportação).
 * 2. A resolveConfig com os novos endpoints.
 * 3. Os exports estão corretos.
 */
import { test } from '@japa/runner';
import { OrganizationProfile } from '../src/components/organization_profile.js';
import { OrganizationSwitcher } from '../src/components/organization_switcher.js';
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js';
import { useOrgInvitations } from '../src/hooks/use_org_invitations.js';
import { useOrganization } from '../src/hooks/use_organization.js';
import { useOrganizations } from '../src/hooks/use_organizations.js';
import { useSwitchOrganization } from '../src/hooks/use_switch_organization.js';

test.group('org hooks exports', () => {
  test('useOrganizations é uma função', ({ assert }) => {
    assert.isFunction(useOrganizations);
  });

  test('useOrganization é uma função', ({ assert }) => {
    assert.isFunction(useOrganization);
  });

  test('useSwitchOrganization é uma função', ({ assert }) => {
    assert.isFunction(useSwitchOrganization);
  });

  test('useOrgInvitations é uma função', ({ assert }) => {
    assert.isFunction(useOrgInvitations);
  });
});

test.group('org components exports', () => {
  test('OrganizationSwitcher é uma função', ({ assert }) => {
    assert.isFunction(OrganizationSwitcher);
  });

  test('OrganizationProfile é uma função', ({ assert }) => {
    assert.isFunction(OrganizationProfile);
  });
});

test.group('resolveConfig — org endpoints', () => {
  test('defaults de orgs e orgInvitations estão corretos', ({ assert }) => {
    const r = resolveConfig();
    assert.equal(r.endpoints.orgs, '/account/orgs/json');
    assert.equal(r.endpoints.orgInvitations, '/account/orgs/invitations/json');
  });

  test('orgs pode ser sobrescrito', ({ assert }) => {
    const r = resolveConfig({ endpoints: { orgs: '/api/my-orgs' } });
    assert.equal(r.endpoints.orgs, '/api/my-orgs');
    assert.equal(r.endpoints.orgInvitations, DEFAULT_CONFIG.endpoints.orgInvitations);
  });

  test('orgInvitations pode ser sobrescrito independentemente', ({ assert }) => {
    const r = resolveConfig({ endpoints: { orgInvitations: '/api/invitations' } });
    assert.equal(r.endpoints.orgs, DEFAULT_CONFIG.endpoints.orgs);
    assert.equal(r.endpoints.orgInvitations, '/api/invitations');
  });

  test('ambos podem ser sobrescritos juntos', ({ assert }) => {
    const r = resolveConfig({ endpoints: { orgs: '/a', orgInvitations: '/b' } });
    assert.equal(r.endpoints.orgs, '/a');
    assert.equal(r.endpoints.orgInvitations, '/b');
  });
});
