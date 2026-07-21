export interface ClientBrand {
  /** Client id (OIDC) que iniciou o fluxo — chave estável pra escolher tema/tela por produto. */
  clientId?: string;
  appName: string;
  accent: string;
  accentSoft: string;
  tagline: string;
  company?: string;
  audienceLabel?: string;
}

export interface BrandingConfig {
  company: string;
  clients: Record<string, Omit<ClientBrand, 'company' | 'audienceLabel'>>;
  default: Omit<ClientBrand, 'company' | 'audienceLabel'>;
  firstParty: string[];
  audienceLabels?: Record<string, string>;
}

export function isFirstParty(cfg: BrandingConfig, clientId: string | undefined): boolean {
  return !!clientId && cfg.firstParty.includes(clientId);
}

export function brandFor(
  cfg: BrandingConfig,
  clientId: string | undefined,
  audience?: string,
): ClientBrand {
  const base = (clientId && cfg.clients[clientId]) || cfg.default;
  const label = audience ? cfg.audienceLabels?.[audience] : undefined;
  return { ...base, clientId, company: cfg.company, ...(label ? { audienceLabel: label } : {}) };
}
