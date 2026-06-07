import { createElement } from 'react'
import { useAuthkitConfig } from '../config.js'
import { useAuthorizedApps, type AuthorizedApp } from '../hooks/use_authorized_apps.js'

export interface AuthorizedAppsProps {
  className?: string
  revokeLabel?: string
  emptyLabel?: string
}

/**
 * Lista os apps autorizados pelo usuário com botão de revogar por item.
 */
function AuthorizedAppsInner({
  className,
  revokeLabel = 'Revogar',
  emptyLabel = 'Nenhum app autorizado.',
}: AuthorizedAppsProps) {
  const { data, loading, error, actions } = useAuthorizedApps()

  if (loading && !data) {
    return createElement('div', { className: 'authkit-apps__loading' }, 'Carregando…')
  }
  if (error) {
    return createElement('p', { className: 'authkit-error', role: 'alert' }, error.message)
  }
  const apps = data ?? []
  if (apps.length === 0) {
    return createElement('p', { className: 'authkit-apps__empty' }, emptyLabel)
  }

  return createElement(
    'ul',
    { className: ['authkit-apps', className].filter(Boolean).join(' ') },
    ...apps.map((app: AuthorizedApp) =>
      createElement(
        'li',
        { key: app.clientId, className: 'authkit-apps__item' },
        createElement(
          'div',
          { className: 'authkit-apps__info' },
          app.logoUrl
            ? createElement('img', {
                className: 'authkit-apps__logo',
                src: app.logoUrl,
                alt: '',
              })
            : null,
          createElement('span', { className: 'authkit-apps__name' }, app.name ?? app.clientId)
        ),
        createElement(
          'button',
          {
            type: 'button',
            className: 'authkit-button authkit-button--danger',
            onClick: () => void actions.revoke(app.clientId),
          },
          revokeLabel
        )
      )
    )
  )
}

/**
 * Depende da REST surface do authkit-server — com `idp: 'external'`
 * (IdP de terceiros) degrada para `null` em vez de chamar endpoints
 * inexistentes.
 */
export function AuthorizedApps(props: Parameters<typeof AuthorizedAppsInner>[0]) {
  const { idp } = useAuthkitConfig()
  if (idp === 'external') return null
  return <AuthorizedAppsInner {...props} />
}
