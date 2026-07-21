/**
 * Ponte estrutural (best-effort) entre a auditoria do authkit e o barramento de
 * diagnostics do Agora. Lê o slot global `@agora/diagnostics:emit` de forma
 * ESTRUTURAL — nunca importa `@adonis-agora/diagnostics` — e degrada para no-op
 * quando o diagnostics não está instalado. Mesmo idioma do
 * `adonis-resilience`/`diagnosticsSink`.
 *
 * Sempre ligado: como `emit` é gratuito quando não há nada inscrito, o custo é
 * desprezível por padrão; um watcher (Telescope ou qualquer
 * `onDiagnostic('authkit', …)`) registra quando presente. Nada aqui pode lançar
 * para dentro do caminho de auth.
 */
const EMIT_SLOT = Symbol.for('@agora/diagnostics:emit');

type EmitFn = (lib: string, event: string, payload: unknown) => void;

/**
 * Republica `event` no barramento de diagnostics como `agora:authkit:<event>`
 * (o canal/diagnostics suffix É o nome do evento — sem tabela de mapeamento).
 * Best-effort: qualquer erro é engolido para nunca quebrar a request.
 */
export function emitDiagnostic(event: string, payload: unknown): void {
  try {
    const emit = (globalThis as Record<symbol, unknown>)[EMIT_SLOT] as EmitFn | undefined;
    emit?.('authkit', event, payload);
  } catch {
    // best-effort: a ponte de diagnostics nunca quebra o caminho de auth.
  }
}
