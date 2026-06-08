import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useKeysQueryOptions,
  useRotateKeysMutationOptions,
  useSetSettingMutationOptions,
  authkitKeys,
} from '@dudousxd/adonis-authkit-react'
import { QueryBoundary } from '../components/QueryBoundary'
import { Skeleton } from '../components/Skeleton'
import { useToast } from '../lib/toast'

export function KeysContainer() {
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    ...useKeysQueryOptions(),
    retry: (n: number, err: unknown) => {
      // 501 = jwks não é managed+store → não adianta retry
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 501) return false
      return n < 1
    },
  })

  const rotate = useMutation(useRotateKeysMutationOptions())
  const setSetting = useMutation(useSetSettingMutationOptions())

  const [maxAgeDays, setMaxAgeDays] = useState<number | null>(null)
  const [keep, setKeep] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const isNotManaged = error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 501
  if (isNotManaged) {
    return (
      <div className="error-box">
        Rotação indisponível: o <code>jwks</code> não é <code>managed</code> com um <code>store</code> persistente
        (ex.: <code>{`{ source: 'managed', store: { driver: 'lucid' } }`}</code>). Chaves inline (<code>source: 'jwks'</code>) não rotacionam.
      </div>
    )
  }

  const policy = data?.policy
  const effMaxAge = maxAgeDays ?? policy?.maxAgeDays ?? 90
  const effKeep = keep ?? policy?.keep ?? 2

  async function savePolicy(next: { enabled?: boolean; maxAgeDays?: number; keep?: number }) {
    setBusy('policy')
    try {
      const value = {
        enabled: next.enabled ?? policy?.enabled ?? false,
        maxAgeDays: next.maxAgeDays ?? effMaxAge,
        keep: next.keep ?? effKeep,
      }
      await setSetting.mutateAsync({ key: 'key_rotation', value })
      qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() })
      setMaxAgeDays(null); setKeep(null)
      toast.success('Política de rotação salva')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally { setBusy(null) }
  }

  async function doRotate(retire: boolean) {
    const msg = retire
      ? 'Isso DESABILITA todas as chaves atuais e cria uma nova. Tokens já emitidos deixam de validar imediatamente. Continuar?'
      : 'Rotacionar agora? Uma chave nova vira a ativa; as antigas continuam validando (janela de grace).'
    if (!window.confirm(msg)) return
    setBusy(retire ? 'retire' : 'rotate')
    try {
      const res = await rotate.mutateAsync(retire ? { retire: true } : { keep: effKeep })
      qc.invalidateQueries({ queryKey: authkitKeys.admin.keys() })
      toast.success(`Rotacionado. Nova chave: ${res.newKid.slice(0, 8)}…`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally { setBusy(null) }
  }

  return (
    <QueryBoundary isLoading={isLoading} error={isNotManaged ? undefined : error} onRetry={refetch}
      skeleton={<Skeleton width="100%" height={220} />}>
      {data && (
        <>
          {/* Status */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-body">
              <div className="settings-row">
                <div className="settings-info">
                  <div className="settings-key">Chave de assinatura ativa</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {data.keys.find((k) => k.active)?.kid ?? '—'}
                  </div>
                </div>
                <div className="settings-info" style={{ textAlign: 'right' }}>
                  <div className="settings-desc">Idade: {data.ageDays} dia(s)</div>
                  <div className="settings-desc">
                    Próxima rotação: {data.nextRotationInDays === null ? '— (auto off)' : `~${data.nextRotationInDays} dia(s)`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Política de rotação */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Rotação automática</h3>
              <p style={{ marginTop: 2 }}>Gera uma chave nova quando a ativa passa da idade máxima; mantém as N mais recentes (janela de grace).</p></div></div>
            <div className="panel"><div className="panel-body" style={{ padding: 0 }}>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Habilitar rotação agendada</div>
                  <div className="settings-desc">key_rotation.enabled</div></div>
                <div className="settings-control">
                  <label className="toggle">
                    <input type="checkbox" checked={Boolean(policy?.enabled)} disabled={busy === 'policy'}
                      onChange={(e) => savePolicy({ enabled: e.target.checked })} />
                    <div className="toggle-track" /><div className="toggle-thumb" />
                  </label>
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Idade máxima (dias)</div>
                  <div className="settings-desc">key_rotation.maxAgeDays</div></div>
                <div className="settings-control">
                  <input className="input input-mono" type="number" style={{ width: 90, textAlign: 'right' }}
                    value={String(effMaxAge)} onChange={(e) => setMaxAgeDays(Number(e.target.value))} />
                  {maxAgeDays !== null && <button className="btn btn-primary btn-sm" disabled={busy === 'policy'}
                    onClick={() => savePolicy({ maxAgeDays: effMaxAge })}>Save</button>}
                </div>
              </div>
              <div className="settings-row">
                <div className="settings-info"><div className="settings-key">Manter N chaves (grace)</div>
                  <div className="settings-desc">key_rotation.keep</div></div>
                <div className="settings-control">
                  <input className="input input-mono" type="number" style={{ width: 90, textAlign: 'right' }}
                    value={String(effKeep)} onChange={(e) => setKeep(Number(e.target.value))} />
                  {keep !== null && <button className="btn btn-primary btn-sm" disabled={busy === 'policy'}
                    onClick={() => savePolicy({ keep: effKeep })}>Save</button>}
                </div>
              </div>
            </div></div>
          </div>

          {/* Chaves */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Chaves no keyset</h3>
              <p style={{ marginTop: 2 }}>A primeira é a ativa (assina); as demais ainda validam tokens (grace).</p></div></div>
            <div className="panel"><div className="panel-body" style={{ padding: 0 }}>
              {data.keys.map((k) => (
                <div key={k.kid} className="settings-row">
                  <div className="settings-info">
                    <div className="settings-key" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {k.kid}
                      <span className="settings-badge" style={k.active ? { background: 'var(--accent-soft, rgba(99,102,241,0.12))', color: 'var(--accent, #6366f1)' } : undefined}>
                        {k.active ? 'ativa' : 'grace'}
                      </span>
                    </div>
                    <div className="settings-desc">{k.alg} · {k.ageDays} dia(s)</div>
                  </div>
                </div>
              ))}
            </div></div>
          </div>

          {/* Ações */}
          <div className="settings-section">
            <div className="settings-section-head"><div><h3>Ações</h3></div></div>
            <div className="panel"><div className="panel-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" disabled={!!busy} onClick={() => doRotate(false)}>
                {busy === 'rotate' ? <span className="spinner sm" /> : 'Rotacionar agora'}
              </button>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => doRotate(true)}
                style={{ color: 'var(--danger, #e5484d)', borderColor: 'var(--danger, #e5484d)' }}>
                {busy === 'retire' ? <span className="spinner sm" /> : 'Desabilitar todas + criar nova'}
              </button>
            </div></div>
          </div>
        </>
      )}
    </QueryBoundary>
  )
}
