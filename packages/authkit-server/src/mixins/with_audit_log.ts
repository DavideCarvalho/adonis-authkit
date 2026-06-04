import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'
import type { AuditEventType } from '../audit/audit_sink.js'

/** Instância composta pelo mixin {@link withAuditLog}. */
export interface AuditLogRow {
  type: AuditEventType
  accountId: string | null
  email: string | null
  clientId: string | null
  actorId: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  createdAt: DateTime
}

export type AuditLogClass<Model extends NormalizeConstructor<typeof BaseModel>> = Model & {
  new (...args: any[]): AuditLogRow
}

export function withAuditLog() {
  return <Model extends NormalizeConstructor<typeof BaseModel>>(
    superclass: Model
  ): AuditLogClass<Model> => {
    class AuditLogMixin extends superclass {
      @column()
      declare type: AuditEventType

      @column()
      declare accountId: string | null

      @column()
      declare email: string | null

      @column()
      declare clientId: string | null

      @column()
      declare actorId: string | null

      @column()
      declare ip: string | null

      @column({
        prepare: (value: Record<string, unknown> | null) =>
          value ? JSON.stringify(value) : null,
        consume: (value: string | null) => (value ? JSON.parse(value) : null),
      })
      declare metadata: Record<string, unknown> | null

      @column.dateTime({ autoCreate: true })
      declare createdAt: DateTime
    }

    return AuditLogMixin as unknown as AuditLogClass<Model>
  }
}
