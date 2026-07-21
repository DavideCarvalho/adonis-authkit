import React from 'react';
import { KeysContainer } from '../containers/keys.containers';

export function Keys() {
  return (
    <div>
      <div className="page-header">
        <div className="page-title">Signing Keys</div>
        <div className="page-sub">
          Chaves JWKS de assinatura — rotação, grace e status. Mudanças aplicam ao vivo.
        </div>
      </div>
      <KeysContainer />
    </div>
  );
}
