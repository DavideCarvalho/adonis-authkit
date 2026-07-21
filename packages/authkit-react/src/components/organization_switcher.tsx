import { createElement, useState } from 'react';
import { useAuthkitConfig } from '../config.js';
import { type OrgEntry, useOrganizations } from '../hooks/use_organizations.js';
import { useSwitchOrganization } from '../hooks/use_switch_organization.js';
import { useAuth } from '../use_auth.js';

export interface OrganizationSwitcherProps {
  /** Rótulo da opção "Conta pessoal" (desativa org ativa). Default: 'Conta pessoal' */
  personalAccountLabel?: string;
  className?: string;
}

/**
 * Dropdown estilo Clerk: mostra a org ativa (ou conta pessoal), lista as orgs
 * do usuário e permite trocar. SSR-safe.
 */
function OrganizationSwitcherInner({
  personalAccountLabel = 'Conta pessoal',
  className,
}: OrganizationSwitcherProps) {
  const { isAuthenticated } = useAuth();
  const { data: orgs, activeOrgId, supported } = useOrganizations();
  const { activate, deactivate, loading: switching } = useSwitchOrganization();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated || !supported) return null;

  const activeOrg = orgs?.find((o) => o.id === activeOrgId) ?? null;
  const label = activeOrg ? activeOrg.name : personalAccountLabel;

  const trigger = createElement(
    'button',
    {
      type: 'button',
      className: 'authkit-orgswitcher__trigger',
      'aria-haspopup': 'listbox',
      'aria-expanded': open,
      disabled: switching,
      onClick: () => setOpen((v) => !v),
    },
    createElement('span', { className: 'authkit-orgswitcher__label' }, label),
    createElement(
      'span',
      { className: 'authkit-orgswitcher__chevron', 'aria-hidden': 'true' },
      '▾',
    ),
  );

  const menu = open
    ? createElement(
        'div',
        { className: 'authkit-orgswitcher__menu', role: 'listbox' },
        // Conta pessoal
        createElement(
          'button',
          {
            type: 'button',
            className: [
              'authkit-orgswitcher__item',
              !activeOrgId ? 'authkit-orgswitcher__item--active' : '',
            ]
              .filter(Boolean)
              .join(' '),
            role: 'option',
            'aria-selected': !activeOrgId,
            onClick: async () => {
              setOpen(false);
              if (activeOrgId) await deactivate();
            },
          },
          createElement(
            'span',
            { className: 'authkit-orgswitcher__item-name' },
            personalAccountLabel,
          ),
        ),
        // Orgs
        ...(orgs ?? []).map((org: OrgEntry) =>
          createElement(
            'button',
            {
              key: org.id,
              type: 'button',
              className: [
                'authkit-orgswitcher__item',
                org.isActive ? 'authkit-orgswitcher__item--active' : '',
              ]
                .filter(Boolean)
                .join(' '),
              role: 'option',
              'aria-selected': org.isActive,
              onClick: async () => {
                setOpen(false);
                if (!org.isActive) await activate(org.id);
              },
            },
            createElement('span', { className: 'authkit-orgswitcher__item-name' }, org.name),
            createElement('span', { className: 'authkit-orgswitcher__item-role' }, org.role),
          ),
        ),
      )
    : null;

  return createElement(
    'div',
    { className: ['authkit-orgswitcher', className].filter(Boolean).join(' ') },
    trigger,
    menu,
  );
}

/**
 * Depende da REST surface do authkit-server — com `idp: 'external'`
 * (IdP de terceiros) degrada para `null` em vez de chamar endpoints
 * inexistentes.
 */
export function OrganizationSwitcher(props: Parameters<typeof OrganizationSwitcherInner>[0]) {
  const { idp } = useAuthkitConfig();
  if (idp === 'external') return null;
  return <OrganizationSwitcherInner {...props} />;
}
