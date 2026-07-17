import {
  createElement,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { InteractionForm } from "./interaction_form.js";
import { buttonClass } from "../utils.js";

export interface MagicLinkButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> {
  /** O `uid` da interaction. */
  uid: string;
  /** CSRF token. */
  csrfToken: string;
  /** Prefixo de mount da interaction, se diferente do padrão. */
  basePath?: string;
  children?: ReactNode;
}

/**
 * Botão pronto de magic link (tier "faz tudo"): um `<form>` POST em `/magic` com
 * um botão de submit. Temável via `className` (mescla com `authkit-button`) e
 * `children`. Construído sobre `InteractionForm` — quem quer controle do form usa
 * o primitivo direto.
 */
export function MagicLinkButton({
  uid,
  csrfToken,
  basePath,
  children = "Enviar link de login",
  className,
  ...rest
}: MagicLinkButtonProps) {
  return createElement(
    InteractionForm,
    { uid, step: "magic", csrfToken, basePath },
    createElement(
      "button",
      {
        type: "submit",
        className: buttonClass("authkit-button--ghost", className),
        ...rest,
      },
      children,
    ),
  );
}
