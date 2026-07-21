import { createElement } from 'react';
import {
  type PasswordScorer,
  type PasswordStrengthScore,
  usePasswordStrength,
} from '../hooks/use_password_strength.js';

export interface PasswordStrengthMeterProps {
  /** A senha a avaliar. */
  password: string;
  /** Scorer plugável (default: heurística leve embutida). */
  scorer?: PasswordScorer;
  /** Mostra a lista de dicas (feedback) abaixo da barra. Default: true. */
  showFeedback?: boolean;
  /** Rótulos por score (0..4). Override para i18n. */
  labels?: [string, string, string, string, string];
  className?: string;
}

const DEFAULT_LABELS: [string, string, string, string, string] = [
  'Very weak',
  'Weak',
  'Fair',
  'Good',
  'Strong',
];

/**
 * Medidor visual de força de senha sobre {@link usePasswordStrength}. Estilizado
 * com as CSS vars `--authkit-*` (importe `@adonis-agora/authkit-react/styles.css`).
 * Headless por baixo — passe um `scorer` (ex.: zxcvbn) para trocar o cálculo.
 */
export function PasswordStrengthMeter({
  password,
  scorer,
  showFeedback = true,
  labels = DEFAULT_LABELS,
  className,
}: PasswordStrengthMeterProps) {
  const { score, feedback } = usePasswordStrength(password, { scorer });
  const cls = ['authkit-strength', className].filter(Boolean).join(' ');

  // Quatro segmentos: preenchidos até `score` (score 0 = nenhum preenchido).
  const segments = [0, 1, 2, 3].map((i) =>
    createElement('span', {
      key: i,
      className: ['authkit-strength__segment', i < score ? 'authkit-strength__segment--filled' : '']
        .filter(Boolean)
        .join(' '),
    }),
  );

  const children = [
    createElement(
      'div',
      {
        key: 'bar',
        className: 'authkit-strength__bar',
        role: 'meter',
        'aria-valuemin': 0,
        'aria-valuemax': 4,
        'aria-valuenow': score,
        'aria-label': labels[score as PasswordStrengthScore],
        'data-score': score,
      },
      segments,
    ),
    createElement(
      'span',
      { key: 'label', className: 'authkit-strength__label' },
      labels[score as PasswordStrengthScore],
    ),
  ];

  if (showFeedback && feedback && feedback.length > 0) {
    children.push(
      createElement(
        'ul',
        { key: 'feedback', className: 'authkit-strength__feedback' },
        feedback.map((tip, i) => createElement('li', { key: i }, tip)),
      ),
    );
  }

  return createElement('div', { className: cls }, children);
}
