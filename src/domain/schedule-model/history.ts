import { nextId } from '@/domain/schedule-model/state'
import type { FieldHistory, FieldHistoryCause, ScheduleState } from '@/domain/schedule-model/types'

export function appendFieldChanges(
  state: ScheduleState,
  changes: Array<{
    callId: string
    field: string
    originalValue: string
    updatedValue: string
    cause: FieldHistoryCause
    reason?: string
    updatedBy: string
    updatedAt: string
  }>,
) {
  let next = state
  const rows: FieldHistory[] = []
  for (const change of changes) {
    if (change.originalValue === change.updatedValue) continue
    const issued = nextId(next, 'hist')
    next = issued.state
    rows.push({
      id: issued.id,
      callId: change.callId,
      field: change.field,
      originalValue: change.originalValue,
      updatedValue: change.updatedValue,
      cause: change.cause,
      reason: change.reason ?? '',
      updatedBy: change.updatedBy,
      updatedAt: change.updatedAt,
    })
  }
  if (!rows.length) return next
  return { ...next, fieldHistory: [...next.fieldHistory, ...rows] }
}

export function fieldHistoryFor(state: ScheduleState, callId: string, field: string) {
  return state.fieldHistory.filter((row) => row.callId === callId && row.field === field)
}
