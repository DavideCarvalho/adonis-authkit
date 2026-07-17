import { createElement, type FormHTMLAttributes, type ReactNode } from "react";
import {
  interactionUrls,
  type InteractionPostStep,
} from "../interaction/urls.js";

export interface InteractionFormProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "method" | "action"
> {
  /** O `uid` da interaction (vem da view do authkit-server). */
  uid: string;
  /** Qual endpoint POST da interaction submeter. */
  step: InteractionPostStep;
  /** CSRF token — vira o campo escondido `_csrf`. */
  csrfToken: string;
  /** Prefixo de mount da interaction, se diferente do padrão. */
  basePath?: string;
  /** Os campos/botões do formulário (o app é dono deles e do estilo). */
  children?: ReactNode;
}

/**
 * Formulário de interaction do AuthKit: `<form method="POST">` apontando pro
 * endpoint certo + o campo escondido `_csrf`, deixando os campos e o estilo pro
 * app. Encapsula o boilerplate que se repetia em cada método (identifier, login,
 * magic): a URL (via `interactionUrls`) e o CSRF. Primitivo componível — os
 * componentes prontos (`MagicLinkButton`) são construídos sobre ele.
 */
export function InteractionForm({
  uid,
  step,
  csrfToken,
  basePath,
  children,
  ...rest
}: InteractionFormProps) {
  const action = interactionUrls(uid, basePath)[step];
  return createElement(
    "form",
    { method: "POST", action, ...rest },
    createElement("input", { type: "hidden", name: "_csrf", value: csrfToken }),
    children,
  );
}
