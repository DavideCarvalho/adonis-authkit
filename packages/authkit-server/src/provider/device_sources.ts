import { type AuthMessages, translate } from '../host/i18n.js';

/**
 * Fontes (sources) de renderização do Device Authorization Grant (RFC 8628).
 *
 * O oidc-provider chama estas funções com o KOA ctx (não o HttpContext do Adonis),
 * então elas NÃO têm acesso ao renderer Inertia/Edge do host. Emitimos HTML
 * auto-contido e i18n-izado (mesmo idioma das demais telas), o que também silencia
 * os avisos `shouldChange` dos defaults da lib. As três telas:
 *  - userCodeInputSource: entrada do user-code (`/device`)
 *  - userCodeConfirmSource: confirmação após o code casar
 *  - successSource: tela final pós-aprovação
 */

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;margin:0;padding:48px 16px;color:#1d1d1f}
  .card{max-width:340px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
  h1{font-size:1.4rem;font-weight:600;margin:0 0 12px;text-align:center}
  p{font-size:.95rem;line-height:1.5;text-align:center;color:#444}
  p.red{color:#c0392b}
  code{display:block;font-size:1.6rem;letter-spacing:.15em;text-align:center;margin:16px 0;font-weight:600}
  input[type=text]{width:100%;box-sizing:border-box;height:46px;font-size:1rem;text-align:center;text-transform:uppercase;border:1px solid #d2d2d7;border-radius:10px;padding:0 12px;margin-bottom:14px}
  button{width:100%;height:44px;font-size:.95rem;font-weight:600;color:#fff;background:#0071e3;border:0;border-radius:10px;cursor:pointer}
  button:hover{background:#0077ed}
  .abort{margin-top:12px;background:none;color:#666;font-weight:400}
  .abort:hover{background:none;text-decoration:underline}
`;

function page(title: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body><div class="card">${inner}</div></body></html>`;
}

export function createDeviceSources(messages: AuthMessages) {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(messages, key, params);

  return {
    async userCodeInputSource(_ctx: any, form: string, _out: any, err: any) {
      const ctx = _ctx;
      let msg: string;
      if (err && (err.userCode || err.name === 'NoCodeError')) {
        msg = `<p class="red">${esc(t('device.input.error_invalid'))}</p>`;
      } else if (err && err.name === 'AbortedError') {
        msg = `<p class="red">${esc(t('device.input.error_aborted'))}</p>`;
      } else if (err) {
        msg = `<p class="red">${esc(t('device.input.error_generic'))}</p>`;
      } else {
        msg = `<p>${esc(t('device.input.intro'))}</p>`;
      }
      ctx.body = page(
        t('device.input.title'),
        `<h1>${esc(t('device.input.title'))}</h1>${msg}${form}<button type="submit" form="op.deviceInputForm">${esc(t('device.input.submit'))}</button>`,
      );
    },

    async userCodeConfirmSource(
      _ctx: any,
      form: string,
      _client: any,
      _deviceInfo: any,
      userCode: string,
    ) {
      const ctx = _ctx;
      ctx.body = page(
        t('device.confirm.title'),
        `<h1>${esc(t('device.confirm.title'))}</h1><p>${esc(t('device.confirm.body'))}</p><code>${esc(userCode)}</code>${form}<button autofocus type="submit" form="op.deviceConfirmForm">${esc(t('device.confirm.submit'))}</button><button class="abort" type="submit" form="op.deviceConfirmForm" value="yes" name="abort">${esc(t('device.confirm.abort'))}</button>`,
      );
    },

    async successSource(_ctx: any) {
      const ctx = _ctx;
      ctx.body = page(
        t('device.success.title'),
        `<h1>${esc(t('device.success.title'))}</h1><p>${esc(t('device.success.body'))}</p>`,
      );
    },
  };
}
