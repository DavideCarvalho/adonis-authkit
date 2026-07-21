import { createElement, useState } from 'react';
import { useAuthkitConfig } from '../config.js';
import { useSignOut } from '../hooks/use_sign_out.js';
import { useAuth } from '../use_auth.js';
import { Avatar } from './avatar.js';

export interface UserButtonProps {
  /** rótulo do link de perfil */
  profileLabel?: string;
  /** rótulo do botão de sair */
  signOutLabel?: string;
  className?: string;
}

/**
 * Avatar clicável com dropdown (link de perfil + sair).
 * Renderiza nada quando não autenticado.
 */
export function UserButton({
  profileLabel = 'Perfil',
  signOutLabel = 'Sair',
  className,
}: UserButtonProps) {
  const { user, isAuthenticated } = useAuth();
  const config = useAuthkitConfig();
  const { signOut } = useSignOut();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated || !user) return null;

  const trigger = createElement(
    'button',
    {
      type: 'button',
      className: 'authkit-userbutton__trigger',
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v),
    },
    createElement(Avatar, { user }),
  );

  const menu = open
    ? createElement(
        'div',
        { className: 'authkit-userbutton__menu', role: 'menu' },
        createElement(
          'div',
          { className: 'authkit-userbutton__header' },
          createElement('div', { className: 'authkit-userbutton__name' }, user.name ?? user.email),
          user.name
            ? createElement('div', { className: 'authkit-userbutton__email' }, user.email)
            : null,
        ),
        createElement(
          'a',
          { className: 'authkit-userbutton__item', role: 'menuitem', href: config.profileUrl },
          profileLabel,
        ),
        createElement(
          'button',
          {
            type: 'button',
            className: 'authkit-userbutton__item',
            role: 'menuitem',
            onClick: () => signOut(),
          },
          signOutLabel,
        ),
      )
    : null;

  return createElement(
    'div',
    { className: ['authkit-userbutton', className].filter(Boolean).join(' ') },
    trigger,
    menu,
  );
}
