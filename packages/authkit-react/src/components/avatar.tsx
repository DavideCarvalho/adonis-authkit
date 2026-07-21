import { createElement } from 'react';
import type { AuthUser } from '../types.js';
import { deriveInitials } from '../utils.js';

export interface AvatarProps {
  user: Pick<AuthUser, 'name' | 'email' | 'avatarUrl'>;
  size?: number;
  className?: string;
}

/** Avatar com imagem ou iniciais de fallback. */
export function Avatar({ user, size = 36, className }: AvatarProps) {
  const cls = ['authkit-avatar', className].filter(Boolean).join(' ');
  const style = { width: size, height: size };
  if (user.avatarUrl) {
    return createElement('img', {
      className: cls,
      src: user.avatarUrl,
      alt: user.name ?? user.email ?? '',
      style,
    });
  }
  return createElement(
    'span',
    { className: cls, style, 'aria-hidden': true },
    deriveInitials(user.name, user.email),
  );
}
