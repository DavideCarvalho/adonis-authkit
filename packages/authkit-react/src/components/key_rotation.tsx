import { createElement, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useKeysQueryOptions, useRotateKeysMutationOptions } from '../queries/admin/index.js'
import { authkitKeys } from '../queries/keys.js'

export interface KeyRotationProps {
  className?: string
}

/**
 * Painel admin de rotação da chave de assinatura JWKS: idade da chave, política +
 * ETA da próxima rotação, e botão "Rotacionar agora" (com opção de aposentar as
 * antigas). Requer estar dentro de um AuthkitClientProvider + QueryClientProvider
 * (o admin console já provê ambos).
 */
function KeyRotationInner({ className }: KeyRotationProps) {
  const qc = useQueryClient()
  const status = useQuery(useKeysQueryOptions())
  const rotate = useMutation({
    ...useRotateKeysMutationOptions(),
    onSuccess: () => qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() }),
  })
  const [retire, setRetire] = useState(false)

  if (status.isLoading && !status.data) {
    return createElement('div', { className: 'authkit-keys__loading' }, 'Carregando…')
  }
  if (status.error) {
    return createElement(
      'p',
      { className: 'authkit-error', role: 'alert' },
      (status.error as Error).message
    )
  }
  const data = status.data!
  const p = data.policy

  return createElement(
    'div',
    { className: ['authkit-card', 'authkit-keys', className].filter(Boolean).join(' ') },
    createElement('h3', { className: 'authkit-keys__title' }, 'Chave de assinatura'),
    createElement(
      'dl',
      { className: 'authkit-keys__stats' },
      createElement('dt', null, 'Idade'),
      createElement('dd', null, `${data.ageDays} dia(s)`),
      createElement('dt', null, 'Rotação automática'),
      createElement(
        'dd',
        null,
        p.enabled ? `a cada ${p.maxAgeDays}d (mantém ${p.keep})` : 'desligada'
      ),
      createElement('dt', null, 'Próxima rotação'),
      createElement(
        'dd',
        null,
        data.nextRotationInDays === null ? '—' : `em ~${data.nextRotationInDays} dia(s)`
      )
    ),
    createElement(
      'label',
      { className: 'authkit-keys__retire' },
      createElement('input', {
        type: 'checkbox',
        checked: retire,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRetire(e.target.checked),
      }),
      ' Aposentar as chaves antigas de imediato'
    ),
    rotate.error
      ? createElement(
          'p',
          { className: 'authkit-error', role: 'alert' },
          (rotate.error as Error).message
        )
      : null,
    createElement(
      'button',
      {
        type: 'button',
        className: 'authkit-button authkit-button--primary',
        disabled: rotate.isPending,
        onClick: () => rotate.mutate(retire ? { retire: true } : undefined),
      },
      rotate.isPending ? 'Rotacionando…' : 'Rotacionar agora'
    )
  )
}

export function KeyRotation(props: Parameters<typeof KeyRotationInner>[0]) {
  return createElement(KeyRotationInner, props)
}
