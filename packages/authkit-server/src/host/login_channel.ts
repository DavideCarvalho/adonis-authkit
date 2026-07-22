/**
 * Canal de login escolhido no seletor "choose-first" (modelo GitHub): o usuário
 * decide PRIMEIRO como quer entrar e só então o método é executado.
 *
 * IMPORTANTE — o `channel` é puramente de SUPERFÍCIE: NÃO condiciona a emissão de
 * token nem toca no codec `ml2:` / lockout / single-use-conjunto. A lib continua
 * emitindo link E código co-locados (quando `login.otp.enabled`); o `channel` só
 * decide o que o E-MAIL renderiza e qual sub-view a TELA mostra no estado
 * `magicLinkSent`. Ausente/ inválido = comportamento histórico ("both").
 */

/** Método escolhido no seletor. `passkey` é slot documentado (ainda não emitido). */
export type LoginChannel = 'code' | 'link';

/**
 * Valor da prop de render que a tela usa para escolher a sub-view do estado
 * `magicLinkSent`: `'code'` = só campo de código, `'link'` = só aviso de link,
 * `'both'` = ambos (comportamento histórico, quando o host não manda `channel`).
 */
export type MagicChannelProp = 'code' | 'link' | 'both';

/**
 * Lê e valida o campo `channel` do body do POST `/magic`. Só `'code'` e `'link'`
 * são aceitos; qualquer outro valor (ausente, vazio, lixo) vira `undefined`, que
 * a lib trata como "both" — garantindo back-compat total com hosts que ainda
 * POSTam sem o campo.
 */
export function normalizeLoginChannel(raw: unknown): LoginChannel | undefined {
  return raw === 'code' || raw === 'link' ? raw : undefined;
}

/**
 * Mapeia o `channel` do body para a prop de render `magicChannel`. Ausente
 * (`undefined`) → `'both'`: a tela mostra as duas sub-views, como hoje.
 */
export function magicChannelProp(channel: LoginChannel | undefined): MagicChannelProp {
  return channel ?? 'both';
}
