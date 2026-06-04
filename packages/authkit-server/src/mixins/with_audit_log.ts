import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { NormalizeConstructor } from '@adonisjs/core/types/helpers'
import { DateTime } from 'luxon'
import type { AuditEventType } from '../audit/audit_sink.js'
import { jsonColumn } from './json_column.js'

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

      // null quando ausente (objeto sempre serializado quando presente).
      @column(jsonColumn<Record<string, unknown> | null>({ fallback: null }))
      declare metadata: Record<string, unknown> | null

      @column.dateTime({ autoCreate: true })
      declare createdAt: DateTime
    }

    return AuditLogMixin as unknown as AuditLogClass<Model>
  }
}
