/**
 * Parser MÍNIMO de user-agent embutido (SEM dependência externa). Reconhece as
 * famílias de browser e SO mais comuns por regexes simples; tudo o mais cai em
 * `'Unknown'`. NÃO é um device-detector completo — o objetivo é só dar contexto
 * legível às sessões no console (account + admin), não fingerprinting.
 */

export interface ParsedUserAgent {
  /** Família do browser (Chrome/Firefox/Safari/Edge/Opera) ou 'Unknown'. */
  browser: string;
  /** Sistema operacional (Windows/macOS/Linux/Android/iOS) ou 'Unknown'. */
  os: string;
}

/**
 * Extrai browser + SO de uma string de user-agent. Ordem importa: Edge/Opera
 * contêm "Chrome" no UA, então são checados ANTES; iOS contém "like Mac OS X",
 * então é checado ANTES do macOS. `null`/vazio → ambos 'Unknown'.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua || typeof ua !== 'string') {
    return { browser: 'Unknown', os: 'Unknown' };
  }

  return { browser: detectBrowser(ua), os: detectOs(ua) };
}

function detectBrowser(ua: string): string {
  // Edge (Chromium): "Edg/" — checar ANTES de Chrome (o UA contém "Chrome").
  if (/\bEdg(?:e|A|iOS)?\//i.test(ua)) return 'Edge';
  // Opera: "OPR/" (Chromium) ou "Opera" (legado) — também antes de Chrome.
  if (/\bOPR\//i.test(ua) || /\bOpera\b/i.test(ua)) return 'Opera';
  // Firefox.
  if (/\bFirefox\//i.test(ua)) return 'Firefox';
  // Chrome / Chromium (cobre "Chrome" e "CriOS" no iOS).
  if (/\b(?:Chrome|CriOS|Chromium)\//i.test(ua)) return 'Chrome';
  // Safari por último: o UA do Safari tem "Safari/" SEM "Chrome".
  if (/\bSafari\//i.test(ua)) return 'Safari';
  return 'Unknown';
}

function detectOs(ua: string): string {
  // iOS antes de macOS: o UA do iOS contém "like Mac OS X".
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(ua)) return 'iOS';
  // Android antes de Linux: o UA do Android contém "Linux".
  if (/\bAndroid\b/i.test(ua)) return 'Android';
  if (/\bWindows\b/i.test(ua)) return 'Windows';
  if (/\bMac OS X\b/i.test(ua) || /\bMacintosh\b/i.test(ua)) return 'macOS';
  if (/\bLinux\b/i.test(ua) || /\bX11\b/i.test(ua)) return 'Linux';
  return 'Unknown';
}
