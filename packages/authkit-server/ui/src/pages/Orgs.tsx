import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import React, { useState } from 'react';
import {
  CreateOrgModal,
  OrgDetailDrawer,
  OrgsTableContainer,
  useOrgsTotal,
} from '../containers/orgs.containers';
import { useDebounce } from '../lib/use_debounce';

export function Orgs() {
  // Estado de rota (URL): paginação, busca e drawer de detalhe via nuqs.
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''));
  const [detailOrgId, setDetailOrgId] = useQueryState('org');
  const dSearch = useDebounce(search, 300);
  // Estado efêmero de UI permanece local.
  const [unavailable, setUnavailable] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const total = useOrgsTotal(dSearch);

  if (unavailable) {
    return (
      <div>
        <div className="page-title" style={{ marginBottom: 8 }}>
          Organizations
        </div>
        <div className="error-box">Organizations are not enabled in this AuthKit installation.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-title">Organizations</div>
          <div className="page-sub">{total.toLocaleString()} orgs</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          New organization
        </button>
      </div>

      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel-head">
          <div className="search-input" style={{ flex: 1, maxWidth: 300 }}>
            <svg
              className="search-ico"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10 10l3 3" strokeLinecap="round" />
            </svg>
            <input
              className="input"
              placeholder="Search organizations…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      <OrgsTableContainer
        search={dSearch}
        page={page}
        onPage={setPage}
        onSelectOrg={setDetailOrgId}
        onUnavailable={() => setUnavailable(true)}
        onCreateClick={() => setCreateOpen(true)}
      />

      {detailOrgId && <OrgDetailDrawer orgId={detailOrgId} onClose={() => setDetailOrgId(null)} />}

      <CreateOrgModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setCreateOpen(false)}
      />
    </div>
  );
}
