import type { HttpContext, Router } from '@adonisjs/core/http';
import type { ResolvedServerConfig } from '../../define_config.js';

/** Contexto entregue a todo método de sudo. */
export interface SudoContext {
  ctx: HttpContext;
  /**
   * Conta logada no console — carregada com `accountStore.findById`.
   *
   * PODE ser null. O comentário original dizia "nunca null: o accountGuard já
   * rodou", mas o `accountGuard` (register_auth_host.ts:91) só verifica que a
   * CHAVE de sessão existe; ele nunca carrega a conta. Sessão viva de conta
   * apagada/anonimizada → `findById` devolve null. Todo método deve tratar.
   *
   * `email` é `string` (não `string | null`) porque é o que o `AccountStore`
   * de fato garante: `findById` devolve `AuthAccount`, cujo `email: string`
   * (accounts/account_store.ts:4). A nulidade real está no objeto, não no campo.
   */
  account: { id: string; email: string } | null;
  accountId: string;
  /** Config resolvida do authkit (accountStore, messages, audit, mail...). */
  cfg: ResolvedServerConfig;
  /** Destino pós-confirmação, já validado — só caminhos internos. */
  returnTo: string | null;
}

/** Como a tela deve renderizar o passo deste método. */
export interface SudoMethodDescriptor {
  /** Chave i18n do rótulo. Ex.: 'account.confirm.method.magic_link'. */
  labelKey: string;
  /**
   * 'form'     — a tela renderiza `fields` e dá POST em `endpoint`.
   * 'action'   — a tela dá POST em `endpoint` sem input.
   * 'redirect' — a tela manda o usuário para `endpoint` (fluxo externo).
   * 'webauthn' — a tela precisa RODAR o handshake WebAuthn antes de postar:
   *              pede as options em `${endpoint}/options`, chama
   *              `navigator.credentials.get` (via `@simplewebauthn/browser`) e
   *              posta a assertion serializada no campo `response` de
   *              `endpoint`.
   *
   * `'webauthn'` existe como KIND próprio, e não como um caso especial do id
   * `passkey`, justamente para a tela não voltar a conhecer método nenhum pelo
   * nome: o endpoint de options é DERIVADO do descritor. Qualquer método do SPI
   * que implemente o mesmo par `POST <endpoint>/options` + `POST <endpoint>`
   * ganha a tela embutida de graça.
   *
   * Um método `'webauthn'` NÃO é utilizável sem JavaScript. Renderizá-lo como
   * um form de submit direto manda `response` vazio e o handler recusa sempre —
   * foi exatamente essa a regressão que motivou este kind.
   */
  kind: 'form' | 'action' | 'redirect' | 'webauthn';
  endpoint: string;
  fields?: Array<{ name: string; type: 'password' | 'text'; labelKey: string }>;
}

/** Helpers que o runtime entrega às rotas de um método. */
export interface SudoRouteHelpers {
  /** Monta o SudoContext a partir do HttpContext (resolve config, conta, returnTo). */
  contextFrom(ctx: HttpContext): Promise<SudoContext>;
  /** ÚNICO ponto de concessão de sudo no pacote. */
  completeSudo(c: SudoContext, methodId: string): Promise<unknown>;
  /** Flash de erro + volta pro /account/confirm preservando return_to. */
  fail(c: SudoContext, messageKey: string): Promise<unknown>;
}

/**
 * Método de confirmação de identidade (sudo mode).
 *
 * REGRA CENTRAL: um método NUNCA chama `markSudo`. Ele decide apenas SE
 * verificou; conceder é do runtime, via `completeSudo`. `markSudo` é a
 * concessão de privilégio — espalhá-la por N métodos multiplicaria por N as
 * chances de alguém conceder sem ter verificado.
 */
export interface SudoMethod {
  /** Estável. Vai no audit (`metadata.method`) e na preferência lembrada. */
  readonly id: string;
  /** Disponível para ESTA conta? Ex.: passkey só se houver passkey cadastrada. */
  isAvailable(c: SudoContext): Promise<boolean>;
  /** O que a tela mostra para este método. */
  describe(c: SudoContext): Promise<SudoMethodDescriptor>;
  /**
   * Endpoints próprios. Opcional: métodos puramente 'redirect' (oidcStepUp)
   * não registram nada, porque o fluxo sai do pacote.
   *
   * Recebe o router cru (não monta por convenção a partir do `id`) porque
   * `password` e `passkey` precisam manter URLs legadas que uma convenção
   * não comportaria.
   */
  register?(router: Router, h: SudoRouteHelpers): void;
}
