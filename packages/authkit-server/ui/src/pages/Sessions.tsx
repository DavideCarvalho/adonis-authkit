import { authkitKeys, useRevokeAllSessionsMutationOptions } from '@adonis-agora/authkit-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parseAsInteger, useQueryState } from 'nuqs';
import React from 'react';
import { SessionsTableContainer, useSessionsTotal } from '../containers/sessions.containers';
import { useToast } from '../lib/toast';

export function Sessions() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const total = useSessionsTotal();

  const revokeMutation = useMutation(useRevokeAllSessionsMutationOptions());

  async function revokeAll() {
    if (!confirm('Revoke ALL active sessions? All users will be logged out.')) return;
    try {
      const r = await revokeMutation.mutateAsync();
      toast.success(`Revoked ${r.revoked ?? 0} sessions`);
      queryClient.invalidateQueries({ queryKey: authkitKeys.admin.sessions() });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Sessions</div>
          <div className="page-sub">{total.toLocaleString()} active sessions</div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-danger"
            onClick={revokeAll}
            disabled={revokeMutation.isPending}
          >
            {revokeMutation.isPending ? (
              <span className="spinner sm" />
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            )}
            Revoke All
          </button>
        </div>
      </div>

      <SessionsTableContainer page={page} onPage={setPage} />
    </div>
  );
}
