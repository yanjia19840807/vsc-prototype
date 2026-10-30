import type { ScheduleActivityLog, ScheduleRefresh, VesselRecord } from '@/types/vsc'
import { terminalPanelColumns } from '@/features/vessel-schedule/mismatch-fields'
import { historyFieldLabel, historyFieldMatches, SEARCH_COLUMNS } from '@/features/vessel-search/search-columns'

export type ActivityCategory = 'field-changed'

export type ActivityFact = {
  label: string
  value: string
}

export type ActivityValueRow = {
  id: string
  field: string
  label: string
  value: string
  original: string
  changed: boolean
}

/** Domain records laid out with one column per field. */
export type ActivityDomainTable = {
  id: string
  title: string
  columns: { id: string; label: string }[]
  records: { id: string; values: string[]; changed?: boolean[] }[]
}

/** One saved result on this record. Field edits and a confirmed match from the same save share the row. */
export type ActivityLogItem = {
  id: string
  category: ActivityCategory
  at: string
  updatedBy: string
  /** System result, or the note typed for a manual change. */
  remark: string
  reason: string
  headline: string
  facts: ActivityFact[]
  detailTitle: string
  domainTables: ActivityDomainTable[]
  changes: ActivityValueRow[]
  touched?: string[]
  association: ActivityFact[]
  resultNote: string
}

const LARA_LOG_COLUMNS: { id: string }[] = [
  { id: 'laraVoyage' },
  { id: 'pointCode' },
  { id: 'laraPoolLocation' },
  { id: 'vesselName' },
  { id: 'brand' },
  { id: 'service' },
  { id: 'laraEta' },
  { id: 'laraEtb' },
  { id: 'laraEtd' },
  { id: 'voyageStatus' },
  { id: 'vesselType' },
  { id: 'terminal9code' },
]

const TERMINAL_LOG_COLUMNS = terminalPanelColumns()

const INTERNAL_REASONS = new Set([
  'Restore source value',
  'Update manual to latest source',
  'Terminal confirmed',
])

type LogBucket = {
  at: string
  by: string
  reason: string
  logs: ScheduleActivityLog[]
}

export function activityLogsOf(
  vessel: VesselRecord,
  _refreshById: (id: string) => ScheduleRefresh | undefined,
  _vessels: VesselRecord[] = [],
): ActivityLogItem[] {
  const logs = (vessel.scheduleLogs ?? []).filter((log) => log.field !== 'Result')
  const ordered = [...logs].sort((a, b) => {
    const time = new Date(a.updatedTime).getTime() - new Date(b.updatedTime).getTime()
    if (time !== 0) return time
    return a.id.localeCompare(b.id)
  })
  const buckets: LogBucket[] = []
  for (const log of ordered) {
    const last = buckets.at(-1)
    if (last && last.at === log.updatedTime && last.by === log.updatedBy && last.reason === log.reason) {
      last.logs.push(log)
      continue
    }
    buckets.push({ at: log.updatedTime, by: log.updatedBy || 'System', reason: log.reason, logs: [log] })
  }

  let terminalValues = new Map<string, string>()
  let confirmed = false
  const items: ActivityLogItem[] = []

  for (const bucket of buckets) {
    const matchLogs = bucket.logs.filter(isMatchLog)
    const laraLogs = bucket.logs.filter((log) => !isMatchLog(log) && !terminalColumnId(log.field))
    const terminalLogs = bucket.logs.filter((log) => terminalColumnId(log.field))
    const match = matchLogs.at(-1)
    const binding = match ? matchTransition(logFrom(match), logTo(match)) : null
    const fieldLogs: ScheduleActivityLog[] = []

    fieldLogs.push(...laraLogs.filter((log) => logFrom(log) !== logTo(log)))

    const matchRows: ActivityValueRow[] = []
    if (binding && match) {
      const beforeTerminal = confirmed ? new Map(terminalValues) : new Map<string, string>()
      const afterTerminal = binding === 'cancel'
        ? new Map<string, string>()
        : nextTerminal(terminalValues, terminalLogs, binding === 'switch')
      matchRows.push(...terminalDiffRows(match.id, beforeTerminal, afterTerminal))
      terminalValues = afterTerminal
      confirmed = binding !== 'cancel'
    } else if (confirmed) {
      fieldLogs.push(...terminalLogs.filter((log) => logFrom(log) !== logTo(log)))
      applyTerminal(terminalValues, terminalLogs)
    } else {
      applyTerminal(terminalValues, terminalLogs)
    }

    const changes = [...fieldLogs.map(changeRow), ...matchRows]
    if (!changes.length) continue
    items.push(resultItem(bucket, {
      id: `field:${match?.id ?? fieldLogs[0]?.id ?? laraLogs[0]?.id ?? bucket.at}`,
      changes,
      touched: changes.map((row) => row.field),
      lara: fieldLogs.some((log) => !terminalColumnId(log.field)),
      terminal: !binding && fieldLogs.some((log) => Boolean(terminalColumnId(log.field))),
      match: binding,
    }))
  }

  return items
}

export function itemTouchesField(item: ActivityLogItem, field: string) {
  const query = field.trim().toLowerCase()
  if (!query) return true
  if (item.touched?.some((id) => fieldHit(id, query))) return true
  return item.changes.some((row) =>
    row.label.toLowerCase().includes(query)
    || row.field.toLowerCase().includes(query)
    || historyFieldMatches(row.field, field),
  )
}

function fieldHit(id: string, query: string) {
  const label = historyFieldLabel(id)
  return label.toLowerCase().includes(query) || id.toLowerCase().includes(query) || historyFieldMatches(id, query)
}

function resultItem(
  bucket: LogBucket,
  input: {
    id: string
    changes: ActivityValueRow[]
    touched: string[]
    lara: boolean
    terminal: boolean
    match: 'confirm' | 'switch' | 'cancel' | null
  },
): ActivityLogItem {
  const remark = bucket.by === 'System'
    ? systemRemark(input)
    : userRemark(bucket.reason)
  return {
    id: input.id,
    category: 'field-changed',
    at: bucket.at,
    updatedBy: bucket.by || 'System',
    remark,
    reason: remark,
    headline: 'Field Change',
    facts: [],
    detailTitle: 'Field Change',
    domainTables: [],
    changes: input.changes,
    touched: input.touched,
    association: [],
    resultNote: '',
  }
}

function systemRemark(input: { lara: boolean; terminal: boolean; match: 'confirm' | 'switch' | 'cancel' | null }) {
  const lines: string[] = []
  if (input.lara) lines.push('系统同步 LARA')
  if (input.terminal) lines.push('系统同步 Terminal')
  if (input.match === 'cancel') lines.push('系统取消匹配')
  else if (input.match) lines.push('系统自动建立匹配')
  return lines.join('，')
}

function userRemark(reason: string) {
  const note = reason.trim()
  if (!note || INTERNAL_REASONS.has(note)) return ''
  return note
}

function matchTransition(from: string, to: string): 'confirm' | 'switch' | 'cancel' | null {
  if (from === to) return null
  const wasBound = isBoundMatch(from)
  const nowBound = isBoundMatch(to)
  if (!wasBound && nowBound) return 'confirm'
  if (wasBound && nowBound) return 'switch'
  if (wasBound && !nowBound) return 'cancel'
  return null
}

function isBoundMatch(label: string) {
  const text = label.trim()
  if (!text || text === 'Unconfirmed' || text === '—') return false
  const parsed = text.match(/^Export\s+(.*?)\s+·\s+Import\s+.*\s+·\s+.*$/)
  const exportVoyage = parsed?.[1]?.trim() ?? ''
  return Boolean(exportVoyage && exportVoyage !== '—')
}

function nextTerminal(current: Map<string, string>, logs: ScheduleActivityLog[], switched: boolean) {
  if (!logs.length) return new Map(current)
  const fresh = switched || logs.every((log) => !logFrom(log))
  const next = fresh ? new Map<string, string>() : new Map(current)
  applyTerminal(next, logs)
  return next
}

function applyTerminal(state: Map<string, string>, logs: ScheduleActivityLog[]) {
  for (const log of logs) {
    const field = terminalColumnId(log.field)
    if (field) state.set(field, logTo(log))
  }
}

function terminalDiffRows(id: string, before: Map<string, string>, after: Map<string, string>): ActivityValueRow[] {
  const rows: ActivityValueRow[] = []
  for (const column of TERMINAL_LOG_COLUMNS) {
    const original = (before.get(column.id) ?? '').trim()
    const updated = (after.get(column.id) ?? '').trim()
    if (original === updated) continue
    rows.push({
      id: `${id}:${column.id}`,
      field: column.id,
      label: column.label,
      original: blankValue(original),
      value: blankValue(updated),
      changed: true,
    })
  }
  return rows
}

function isMatchLog(log: ScheduleActivityLog) {
  return log.field === 'Match' || Boolean(log.originalMatchResult || log.updatedMatchResult)
}

function logFrom(log: ScheduleActivityLog) {
  return (isMatchLog(log) ? log.originalMatchResult : log.originalValue).trim()
}

function logTo(log: ScheduleActivityLog) {
  return (isMatchLog(log) ? log.updatedMatchResult : log.updatedValue).trim()
}

function changeRow(log: ScheduleActivityLog): ActivityValueRow {
  return {
    id: log.id,
    field: log.field,
    label: historyFieldLabel(log.field),
    value: blankValue(logTo(log)),
    original: blankValue(logFrom(log)),
    changed: true,
  }
}

function laraColumnId(field: string) {
  if (LARA_LOG_COLUMNS.some((column) => column.id === field)) return field
  const column = SEARCH_COLUMNS.find((item) => item.id === field && item.source === 'lara')
  return column?.id
}

function terminalColumnId(field: string) {
  return TERMINAL_LOG_COLUMNS.find((column) => historyFieldMatches(field, column.id))?.id
}

function blankValue(value: string) {
  const text = value.trim()
  return text || '—'
}
