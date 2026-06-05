import { createHmac } from 'node:crypto'
import type { AuditEvent, AuditSink } from '../audit/audit_sink.js'

/**
 * Configuração de eventos/webhooks para o host observar tudo que o IdP audita.
 *
 *   - `onEvent`: callback in-process disparado para CADA evento de auditoria
 *     (best-effort, fire-and-forget). Útil para encaminhar a um bus interno.
 *   - `webhook`: POST JSON do evento para uma URL externa. Quando `secret` é dado,
 *     assina o corpo com HMAC-SHA256 no header `x-authkit-signature`.
 *
 * Nada aqui pode lançar para dentro do caminho da request: todo erro é engolido.
 */
export interface EventsConfigInput {
  /** Callback in-process para cada evento auditado (best-effort). */
  onEvent?: (event: AuditEvent) => void | Promise<void>
  /** Webhook HTTP: POST do evento em JSON. */
  webhook?: {
    /** URL de destino do POST. */
    url: string
    /** Segredo opcional para assinar o corpo (HMAC-SHA256). */
    secret?: string
  }
}

export interface ResolvedEventsConfig {
  onEvent?: (event: AuditEvent) => void | Promise<void>
  webhook?: { url: string; secret?: string }
}

export function resolveEvents(input?: EventsConfigInput): ResolvedEventsConfig | undefined {
  if (!input || (!input.onEvent && !input.webhook)) return undefined
  return {
    onEvent: input.onEvent,
    webhook: input.webhook,
  }
}

/** Timeout (ms) do POST do webhook antes de abortar. */
const WEBHOOK_TIMEOUT_MS = 5000

/**
 * Constrói o corpo JSON canônico do webhook a partir de um evento de auditoria.
 * O `ts` é o instante do dispatch (ISO 8601).
 */
export function buildWebhookBody(event: AuditEvent): string {
  return JSON.stringify({
    type: event.type,
    accountId: event.accountId ?? null,
    email: event.email ?? null,
    clientId: event.clientId ?? null,
    ip: event.ip ?? null,
    metadata: event.metadata ?? {},
    ts: new Date().toISOString(),
  })
}

/** Calcula o header de assinatura `sha256=<hmac>` para um corpo + segredo. */
export function signWebhookBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Dispara o webhook de forma fire-and-forget: timeout de 5s via AbortSignal,
 * captura QUALQUER erro (rede, abort, HMAC) sem propagar. Nunca lança.
 */
async function dispatchWebhook(
  webhook: { url: string; secret?: string },
  event: AuditEvent
): Promise<void> {
  try {
    const body = buildWebhookBody(event)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (webhook.secret) {
      headers['x-authkit-signature'] = signWebhookBody(body, webhook.secret)
    }
    await fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
  } catch {
    // best-effort: erro de webhook nunca quebra o caminho da request.
  }
}

/**
 * Decora um AuditSink (ou cria um do zero) num sink fan-out: cada `record`
 * persiste no sink original (se houver) E dispara onEvent + webhook. Falhas em
 * qualquer ramo são isoladas — uma não impede as outras nem a request.
 *
 * `list` é delegado ao sink original quando existir (preserva a consulta admin).
 */
export function composeAuditSink(
  original: AuditSink | undefined,
  events: ResolvedEventsConfig
): AuditSink {
  const composed: AuditSink = {
    async record(event: AuditEvent): Promise<void> {
      // Persistência original (best-effort, isolada).
      if (original) {
        try {
          await original.record(event)
        } catch {
          // sink original com defeito não impede os demais ramos.
        }
      }
      // Callback in-process (best-effort, isolado).
      if (events.onEvent) {
        try {
          await events.onEvent(event)
        } catch {
          // onEvent com defeito não quebra a request.
        }
      }
      // Webhook fire-and-forget (não aguardamos a entrega).
      if (events.webhook) {
        void dispatchWebhook(events.webhook, event)
      }
    },
  }
  // Preserva a capacidade de consulta do sink original (console admin).
  if (original && typeof original.list === 'function') {
    composed.list = original.list.bind(original)
  }
  // Preserva a anonimização (LGPD) do sink original (deleção de conta).
  if (original && typeof original.anonymizeAccount === 'function') {
    composed.anonymizeAccount = original.anonymizeAccount.bind(original)
  }
  return composed
}
