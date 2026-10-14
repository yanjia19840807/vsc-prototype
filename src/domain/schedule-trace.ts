import type {
  HistoryDetail,
  HistoryType,
  ScheduleActivityLog,
  ScheduleRefresh,
  VesselRecord,
} from '@/types/vsp'

export type FieldChange = {
  field: string
  from: string
  to: string
}

const SYSTEM_TYPES: ReadonlySet<HistoryType> = new Set(['LARA sync', 'Terminal sync', 'Auto match'])

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createRefresh(input: {
  source: ScheduleRefresh['source']
  trigger: ScheduleRefresh['trigger']
  refreshTime: string
  updatedBy: string
  result?: ScheduleRefresh['result']
  failureSource?: ScheduleRefresh['failureSource']
  vessel?: VesselRecord
}): ScheduleRefresh {
  const terminal = input.source === 'Terminal'
  return {
    id: nextId('refresh'),
    source: input.source,
    trigger: input.trigger,
    refreshTime: input.refreshTime,
    updatedBy: input.updatedBy,
    result: input.result ?? 'Success',
    failureSource: input.failureSource ?? '',
    internalVoyage: terminal ? input.vessel?.laraVoyage ?? '' : '',
    port: terminal ? input.vessel?.pointCode ?? '' : '',
    poolLocation: terminal ? input.vessel?.poolLocation ?? '' : '',
    vesselId: terminal ? input.vessel?.id ?? '' : '',
  }
}

export function appendScheduleLogs(
  vessel: VesselRecord,
  changes: FieldChange[],
  input: {
    updateSource: ScheduleActivityLog['updateSource']
    refreshId?: string
    updatedTime: string
    updatedBy: string
    reason?: string
    match?: boolean
  },
) {
  vessel.scheduleLogs = vessel.scheduleLogs ?? []
  for (const change of changes) {
    if (change.from === change.to) continue
    const match = input.match || change.field === 'Match'
    vessel.scheduleLogs.unshift({
      id: nextId('alog'),
      vesselId: vessel.id,
      internalVoyage: vessel.laraVoyage,
      port: vessel.pointCode,
      poolLocation: vessel.poolLocation,
      updateSource: input.updateSource,
      refreshId: input.refreshId ?? '',
      updatedTime: input.updatedTime,
      updatedBy: input.updatedBy,
      field: change.field,
      originalValue: match ? '' : change.from,
      updatedValue: match ? '' : change.to,
      originalMatchResult: match ? change.from : '',
      updatedMatchResult: match ? change.to : '',
      reason: input.reason ?? '',
    })
  }
}

function isSystem(type: HistoryType) {
  return SYSTEM_TYPES.has(type)
}

/** Build Refresh records and per-call activity logs from seeded history. */
export function traceFromHistory(vessels: VesselRecord[]): ScheduleRefresh[] {
  const refreshes: ScheduleRefresh[] = []
  const laraByTime = new Map<string, ScheduleRefresh>()
  const terminalByCall = new Map<string, ScheduleRefresh>()

  for (const vessel of vessels) {
    const logs: ScheduleActivityLog[] = []
    for (const entry of vessel.history ?? []) {
      let refreshId = ''
      if (entry.type === 'LARA sync') {
        let refresh = laraByTime.get(entry.at)
        if (!refresh) {
          refresh = createRefresh({
            source: 'LARA',
            trigger: 'Schedule',
            refreshTime: entry.at,
            updatedBy: 'System',
          })
          laraByTime.set(entry.at, refresh)
          refreshes.push(refresh)
        }
        refreshId = refresh.id
      } else if (entry.type === 'Terminal sync' || entry.type === 'Auto match') {
        const key = `${vessel.id}|${entry.at}`
        let refresh = terminalByCall.get(key)
        if (!refresh) {
          refresh = createRefresh({
            source: 'Terminal',
            trigger: entry.trigger === 'Manual' ? 'Manual' : 'Schedule',
            refreshTime: entry.at,
            updatedBy: entry.trigger === 'Manual' ? entry.by : 'System',
            vessel,
          })
          terminalByCall.set(key, refresh)
          refreshes.push(refresh)
        }
        refreshId = refresh.id
      }
      const match = entry.type === 'Auto match' || entry.type === 'Manual match'
      for (const detail of entry.details) {
        if (detail.from === detail.to) continue
        const rowMatch = match || detail.field === 'Match'
        logs.push({
          id: `${entry.id}-${detail.field}-${logs.length}`,
          vesselId: vessel.id,
          internalVoyage: vessel.laraVoyage,
          port: vessel.pointCode,
          poolLocation: vessel.poolLocation,
          updateSource: isSystem(entry.type) ? 'System Sync' : 'Manual Update',
          refreshId,
          updatedTime: entry.at,
          updatedBy: isSystem(entry.type) ? 'System' : entry.by,
          field: detail.field,
          originalValue: rowMatch ? '' : detail.from,
          updatedValue: rowMatch ? '' : detail.to,
          originalMatchResult: rowMatch ? detail.from : '',
          updatedMatchResult: rowMatch ? detail.to : '',
          reason: entry.reason ?? '',
        })
      }
    }
    vessel.scheduleLogs = logs
  }

  refreshes.sort((a, b) => new Date(b.refreshTime).getTime() - new Date(a.refreshTime).getTime())
  return refreshes
}

export function changesFromDetails(details: HistoryDetail[]): FieldChange[] {
  return details.map((detail) => ({ field: detail.field, from: detail.from, to: detail.to }))
}
