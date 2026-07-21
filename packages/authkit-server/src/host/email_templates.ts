/**
 * Renderização de e-mails transacionais do host-kit (reset de senha / verificação).
 *
 * Sem dependências (template literals) e com HTML email-safe: estilos inline,
 * layout em tabela centralizada, botão de CTA com a cor de acento da marca, e
 * sempre um corpo `text` de fallback. Branding vem do `config/authkit.ts`
 * (`branding.default` ou a marca do client). Tudo escapado para evitar injeção.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface EmailTemplateInput {
  /** Marca usada no cabeçalho/botão/rodapé (accent/company opcionais). */
  brand: { appName: string; accent?: string; company?: string };
  /** Assunto do e-mail. */
  subject: string;
  /** Saudação/título dentro do card. */
  heading: string;
  /** Parágrafo de introdução (texto puro, será escapado). */
  intro: string;
  /** Rótulo do botão de CTA. */
  ctaLabel: string;
  /** URL do CTA. */
  ctaUrl: string;
  /** Linha auxiliar abaixo do botão (ex.: validade do link). */
  footnote?: string;
  /** Texto que precede o link de fallback (i18n). Default em inglês. */
  linkFallback?: string;
  /** Locale do documento HTML (atributo `lang`). Default: 'en'. */
  locale?: string;
}

/** Escapa texto para interpolação segura em HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FALLBACK_ACCENT = '#4f46e5';

export function renderTransactionalEmail(input: EmailTemplateInput): EmailContent {
  const appName = input.brand.appName || input.brand.company || 'AuthKit';
  const accent = input.brand.accent || FALLBACK_ACCENT;
  const company = input.brand.company || appName;
  const year = '©'; // ano resolvido fora (sem Date.* aqui); rodapé usa só o nome.
  const lang = input.locale || 'en';
  const linkFallback =
    input.linkFallback ||
    'If the button does not work, copy and paste this link into your browser:';

  const html = `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
<tr><td style="background:${esc(accent)};padding:20px 28px;">
<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">${esc(appName)}</span>
</td></tr>
<tr><td style="padding:32px 28px 8px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">${esc(input.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${esc(input.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${esc(accent)};">
<a href="${esc(input.ctaUrl)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(input.ctaLabel)}</a>
</td></tr></table>
${input.footnote ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">${esc(input.footnote)}</p>` : ''}
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">${esc(linkFallback)}<br><a href="${esc(input.ctaUrl)}" style="color:${esc(accent)};word-break:break-all;">${esc(input.ctaUrl)}</a></p>
</td></tr>
<tr><td style="padding:24px 28px 28px;border-top:1px solid #f3f4f6;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">${esc(company)} ${year}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.heading,
    '',
    input.intro,
    '',
    `${input.ctaLabel}: ${input.ctaUrl}`,
    ...(input.footnote ? ['', input.footnote] : []),
    '',
    `— ${company}`,
  ].join('\n');

  return { subject: input.subject, html, text };
}
