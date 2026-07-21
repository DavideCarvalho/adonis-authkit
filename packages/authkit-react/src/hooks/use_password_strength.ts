import { useMemo } from 'react';

/** Score de 0 (muito fraca) a 4 (muito forte), no estilo zxcvbn. */
export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

/** Resultado de um scorer de senha. */
export interface PasswordStrengthResult {
  score: PasswordStrengthScore;
  /** Dicas/avisos opcionais (ex.: "adicione um símbolo"). */
  feedback?: string[];
}

/** Função plugável que pontua uma senha. */
export type PasswordScorer = (password: string) => PasswordStrengthResult;

export interface UsePasswordStrengthOptions {
  /**
   * Scorer customizado. Quando ausente, usa a heurística leve embutida
   * (comprimento + variedade de classes de caracteres, SEM dependência).
   *
   * @example
   * // Plugando o zxcvbn (NÃO é dependência desta lib — instale no seu app):
   * import { zxcvbn } from '@zxcvbn-ts/core'
   * const scorer = (password) => {
   *   const { score, feedback } = zxcvbn(password)
   *   return { score, feedback: feedback.suggestions }
   * }
   * const { score } = usePasswordStrength(password, { scorer })
   */
  scorer?: PasswordScorer;
}

/**
 * Heurística leve embutida (default): pontua por comprimento e variedade de
 * classes de caracteres (minúscula, maiúscula, dígito, símbolo). NÃO substitui um
 * scorer real como o zxcvbn — é um feedback visual rápido, sem dependências.
 */
export function heuristicScorer(password: string): PasswordStrengthResult {
  if (!password) return { score: 0, feedback: ['Enter a password.'] };

  const feedback: string[] = [];
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  const variety = classes.filter((re) => re.test(password)).length;
  const length = password.length;

  // Pontuação base por comprimento.
  let points = 0;
  if (length >= 8) points += 1;
  if (length >= 12) points += 1;
  if (length >= 16) points += 1;
  // Bônus por variedade de classes.
  if (variety >= 2) points += 1;
  if (variety >= 3) points += 1;

  // Dicas acionáveis.
  if (length < 12) feedback.push('Use at least 12 characters.');
  if (!/[A-Z]/.test(password)) feedback.push('Add an uppercase letter.');
  if (!/[0-9]/.test(password)) feedback.push('Add a number.');
  if (!/[^A-Za-z0-9]/.test(password)) feedback.push('Add a symbol.');

  const score = Math.max(0, Math.min(4, points)) as PasswordStrengthScore;
  return { score, feedback: feedback.length ? feedback : undefined };
}

/**
 * Hook headless de força de senha. Recalcula (memoizado) quando a senha ou o
 * scorer mudam. Use o resultado para alimentar uma barra/medidor — veja
 * {@link PasswordStrengthMeter} para um componente pronto.
 */
export function usePasswordStrength(
  password: string,
  options: UsePasswordStrengthOptions = {},
): PasswordStrengthResult {
  const scorer = options.scorer ?? heuristicScorer;
  return useMemo(() => scorer(password), [password, scorer]);
}
