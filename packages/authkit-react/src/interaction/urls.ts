/**
 * Builders das URLs de interaction do AuthKit — a camada de funções (tier mais
 * baixo) do login. Os apps não devem concatenar `'/auth/interaction/' + uid + '/...'`
 * à mão: se o prefixo de rota do authkit-server mudar, a string mágica quebra
 * silenciosamente. Uma fonte única, tipada, resolve isso.
 */

/** Endpoints do fluxo de interaction para um `uid`. */
export interface InteractionUrls {
  /** POST — envia o identificador (e-mail) e avança pro passo de credenciais. */
  identifier: string;
  /** POST — login por senha. */
  login: string;
  /** POST — dispara o envio do magic link. */
  magic: string;
  /** GET — tela de criação de conta. */
  signup: string;
  /** GET — troca de conta (volta pro passo de identificador). */
  switch: string;
  /** POST — options da cerimônia de passkey. */
  passkeyOptions: string;
  /** POST — verificação (página inteira) da cerimônia de passkey. */
  passkeyVerify: string;
}

/**
 * Monta as URLs de interaction para um `uid`. `basePath` default `/auth/interaction`
 * cobre o mount padrão do authkit-server; passe outro se o app montou em prefixo
 * diferente.
 */
export function interactionUrls(
  uid: string,
  basePath = "/auth/interaction",
): InteractionUrls {
  const base = `${basePath}/${uid}`;
  return {
    identifier: `${base}/identifier`,
    login: `${base}/login`,
    magic: `${base}/magic`,
    signup: `${base}/signup`,
    switch: `${base}/switch`,
    passkeyOptions: `${base}/passkey/options`,
    passkeyVerify: `${base}/passkey/verify`,
  };
}

/** Passos de interaction que são POST de formulário (consumidos por `InteractionForm`). */
export type InteractionPostStep = "identifier" | "login" | "magic";

/**
 * URL de redirect de um provedor OAuth (ex.: `oauthRedirectUrl('google', uid)` →
 * `/auth/google/redirect/{uid}`). `basePath` default `/auth`.
 */
export function oauthRedirectUrl(
  provider: string,
  uid: string,
  basePath = "/auth",
): string {
  return `${basePath}/${provider}/redirect/${uid}`;
}
