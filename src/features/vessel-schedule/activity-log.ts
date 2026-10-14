import type { ScheduleActivityLog, ScheduleRefresh, UpdateSource, VesselRecord } from '@/types/vsp'
import { historyFieldLabel, historyFieldMatches } from '@/features/vessel-search/search-columns'

export type ActivityFieldChange = {
  id: string
  field: string
  fieldLabel: string
  original: string
  updated: string
}

export type ActivityMatchChange = {
  original: string
  updated: string
}

/** One sync's effect on this call, or one manual save. */
export type ActivityLogOperation = {
  id: string
  updatedTime: string
  updateSource: UpdateSource
  refreshId: string
  refreshLabel: string
  updatedBy: string
  reason: string
  summary: string
  fieldChanges: ActivityFieldChange[]
  matchChange: ActivityMatchChange | null
}

export function refreshLabel(refresh?: ScheduleRefresh) {
  if (!refresh) return ''
  return `${refresh.source} · ${refresh.trigger}`
}

function isMatch(log: ScheduleActivityLog) {
  return log.field === 'Match' || Boolean(log.originalMatchResult || log.updatedMatchResult)
}

function operationSummary(input: {
  updateSource: UpdateSource
  fieldChanges: ActivityFieldChange[]
  matchChange: ActivityMatchChange | null
}) {
  const only = input.fieldChanges.length === 1 ? input.fieldChanges[0] : undefined
  if (input.updateSource === 'Manual Update' && !input.matchChange && only?.field === 'laraLink') {
    return only.updated ? 'Linked to LARA' : 'LARA link removed'
  }
  if (
    input.updateSource === 'Manual Update'
    && !input.matchChange
    && only?.field === 'mappingStatus'
    && (only.updated === 'Linked' || only.original === 'Linked')
  ) {
    return only.updated === 'Linked' ? 'Marked as Linked' : 'LARA link removed'
  }
  const count = input.fieldChanges.length + (input.matchChange ? 1 : 0)
  const fields = count === 1 ? '1 field' : `${count} fields`
  const received = input.fieldChanges.every((change) => !change.original)
    && (!input.matchChange || !input.matchChange.original || input.matchChange.original === 'Unconfirmed')
  if (input.updateSource === 'Manual Update' && input.matchChange) {
    return input.fieldChanges.length ? `Match confirmed · ${fields}` : 'Match confirmed'
  }
  if (input.updateSource === 'Manual Update' && received) return `Vessel created · ${fields}`
  if (received && input.matchChange) return `Schedule received · ${fields} · Match`
  if (received) return `Schedule received · ${fields}`
  if (input.matchChange && !input.fieldChanges.length) return 'Match confirmed'
  return input.matchChange ? `${fields} updated · Match` : `${fields} updated`
}

function groupKey(log: ScheduleActivityLog) {
  if (log.updateSource === 'System Sync' && log.refreshId) return `sync:${log.refreshId}`
  return `manual:${log.updatedTime}|${log.updatedBy}`
}

export function activityOperationsOf(
  vessel: VesselRecord,
  refreshById: (id: string) => ScheduleRefresh | undefined,
): ActivityLogOperation[] {
  const groups = new Map<string, ScheduleActivityLog[]>()
  for (const log of vessel.scheduleLogs ?? []) {
    const key = groupKey(log)
    const list = groups.get(key) ?? []
    list.push(log)
    groups.set(key, list)
  }
  const operations: ActivityLogOperation[] = []
  for (const [key, logs] of groups) {
    const first = logs[0]
    if (!first) continue
    const refresh = first.refreshId ? refreshById(first.refreshId) : undefined
    const fieldChanges: ActivityFieldChange[] = []
    let matchChange: ActivityMatchChange | null = null
    for (const log of logs) {
      if (isMatch(log)) {
        matchChange = {
          original: log.originalMatchResult,
          updated: log.updatedMatchResult,
        }
        continue
      }
      fieldChanges.push({
        id: log.id,
        field: log.field,
        fieldLabel: historyFieldLabel(log.field),
        original: log.originalValue,
        updated: log.updatedValue,
      })
    }
    const reasons = [...new Set(logs.map((log) => log.reason).filter(Boolean))]
    operations.push({
      id: key,
      updatedTime: first.updatedTime,
      updateSource: first.updateSource,
      refreshId: first.refreshId,
      refreshLabel: refreshLabel(refresh),
      updatedBy: first.updatedBy,
      reason: reasons.join('; '),
      summary: operationSummary({
        updateSource: first.updateSource,
        fieldChanges,
        matchChange,
      }),
      fieldChanges,
      matchChange,
    })
  }
  return operations
}

export function operationTouchesField(operation: ActivityLogOperation, field: string) {
  const query = field.trim().toLowerCase()
  if (!query) return true
  return operation.fieldChanges.some((change) =>
    change.fieldLabel.toLowerCase().includes(query)
    || change.field.toLowerCase().includes(query)
    || historyFieldMatches(change.field, field),
  ) || (query === 'match' && Boolean(operation.matchChange))
}
