import type { ScheduleActivityLog, ScheduleRefresh, TerminalSchedule, VesselRecord } from '@/types/vsp'
import { laraLinkKey } from '@/features/vessel-schedule/lara-link'
import { historyFieldLabel, historyFieldMatches, SEARCH_COLUMNS, searchCellText, type ColumnSource } from '@/features/vessel-search/search-columns'

export type ActivityCategory =
  | 'lara-sync'
  | 'terminal-sync'
  | 'terminal-match'
  | 'lara-create'
  | 'lara-update'
  | 'terminal-create'
  | 'terminal-update'
  | 'lara-link'

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: 'lara-sync', label: 'LARA sync' },
  { id: 'terminal-sync', label: 'Terminal sync' },
  { id: 'terminal-match', label: 'Terminal Match' },
  { id: 'lara-create', label: 'LARA create' },
  { id: 'lara-update', label: 'LARA update' },
  { id: 'terminal-create', label: 'Terminal Create' },
  { id: 'terminal-update', label: 'Terminal update' },
  { id: 'lara-link', label: 'LARA link' },
]

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
  records: { id: string; values: string[] }[]
}

/** One sync or one save, described for a single activity category. */
export type ActivityLogItem = {
  id: string
  category: ActivityCategory
  at: string
  updatedBy: string
  reason: string
  headline: string
  facts: ActivityFact[]
  detailTitle: string
  /** Synced or entered values, one table per domain record. */
  domainTables: ActivityDomainTable[]
  /** Later edits and syncs that replace an existing value. */
  changes: ActivityValueRow[]
  association: ActivityFact[]
  resultNote: string
}

const LARA_SNAPSHOT_FIELDS = [
  ...SEARCH_COLUMNS.filter((column) => column.source === 'lara').map((column) => column.id),
  'remark',
]

function columnSource(field: string): ColumnSource {
  const direct = SEARCH_COLUMNS.find((column) => column.id === field)
  if (direct) return direct.source
  const aliased = SEARCH_COLUMNS.find((column) => historyFieldMatches(field, column.id))
  return aliased?.source ?? 'platform'
}

function isLinkLog(log: ScheduleActivityLog) {
  return log.field === 'laraLink' || log.field === 'laraLinkSource'
}

function isMatchLog(log: ScheduleActivityLog) {
  return log.field === 'Match' || Boolean(log.originalMatchResult || log.updatedMatchResult)
}

function callKey(
  log: Pick<ScheduleActivityLog, 'laraVoyage' | 'pointCode' | 'laraPoolLocation' | 'visitNo'>,
  vessel: VesselRecord,
) {
  const voyage = log.laraVoyage || vessel.laraVoyage
  const point = log.pointCode || vessel.pointCode
  const pool = log.laraPoolLocation || vessel.laraPoolLocation
  const visit = log.visitNo || vessel.visitNo
  return [voyage, point, pool, visit].filter(Boolean).join(' · ') || '—'
}

function blankValue(value: string) {
  const text = value.trim()
  return text || '—'
}

const LARA_DETAIL_COLUMNS = SEARCH_COLUMNS.filter((column) => column.source === 'lara')

export function activityLogsOf(
  vessel: VesselRecord,
  refreshById: (id: string) => ScheduleRefresh | undefined,
  vessels: VesselRecord[] = [],
): ActivityLogItem[] {
  const groups = new Map<string, ScheduleActivityLog[]>()
  for (const log of vessel.scheduleLogs ?? []) {
    const key = groupKey(log, refreshById(log.refreshId))
    const list = groups.get(key) ?? []
    list.push(log)
    groups.set(key, list)
  }

  const items: ActivityLogItem[] = []
  for (const [key, logs] of groups) {
    const refresh = refreshById(logs[0]?.refreshId ?? '')
    items.push(...itemsFromGroup(key, logs, refresh, vessel, vessels))
  }

  for (const refresh of terminalRefreshesWithoutLogs(vessel, refreshById, items)) {
    items.push(terminalItem(`terminal:${refresh.id}`, [], refresh, vessel))
  }
  for (const entry of vessel.history ?? []) {
    if (entry.type !== 'Terminal sync') continue
    if (entry.details.some((detail) => detail.from !== detail.to)) continue
    if (items.some((item) => item.category === 'terminal-sync' && item.at === entry.at)) continue
    items.push(terminalItem(`terminal-empty:${entry.id}`, [], {
      id: entry.id,
      source: 'Terminal',
      trigger: entry.trigger === 'Manual' ? 'Manual' : 'Schedule',
      refreshTime: entry.at,
      updatedBy: 'System',
      result: 'Success',
      failureSource: '',
      laraVoyage: vessel.laraVoyage,
      pointCode: vessel.pointCode,
      visitNo: vessel.visitNo,
      laraPoolLocation: vessel.laraPoolLocation,
      vesselId: vessel.id,
    }, vessel))
  }

  applyLaraSnapshots(items.filter((item) => item.category === 'lara-sync'))
  applyTerminalTables(items.filter((item) => item.category === 'terminal-sync'), vessel)
  return items
}

function groupKey(log: ScheduleActivityLog, refresh?: ScheduleRefresh) {
  if (isLinkLog(log)) return `link:${log.updatedTime}|${log.updatedBy}|${log.reason}`
  if (log.updateSource === 'System Sync' && refresh?.source === 'LARA' && log.refreshId) return `lara:${log.refreshId}`
  if (log.updateSource === 'System Sync' && log.refreshId) return `terminal:${log.refreshId}`
  if (isMatchLog(log)) return `terminal-manual:${log.updatedTime}|${log.updatedBy}|${log.reason}`
  const side = columnSource(log.field) === 'terminal' ? 'terminal' : 'lara'
  return `edit:${side}:${log.updatedTime}|${log.updatedBy}|${log.reason}`
}

function itemsFromGroup(
  id: string,
  logs: ScheduleActivityLog[],
  refresh: ScheduleRefresh | undefined,
  vessel: VesselRecord,
  vessels: VesselRecord[],
): ActivityLogItem[] {
  const first = logs[0]
  if (!first) return []
  if (logs.every(isLinkLog)) return [linkItem(id, logs, vessels)]
  if (refresh?.source === 'LARA' || id.startsWith('lara:')) return laraOutcome(id, logs, refresh, vessel)
  if (refresh?.source === 'Terminal' || logs.some(isMatchLog) || id.startsWith('terminal')) {
    return terminalOutcome(id, logs, refresh, vessel)
  }
  const laraLogs = logs.filter((log) => columnSource(log.field) !== 'terminal')
  const terminalLogs = logs.filter((log) => columnSource(log.field) === 'terminal')
  const items: ActivityLogItem[] = []
  if (laraLogs.length) items.push(changeItem(`${id}:lara`, 'lara-update', laraLogs))
  if (terminalLogs.length) items.push(changeItem(`${id}:terminal`, 'terminal-update', terminalLogs))
  return items
}

function laraOutcome(
  id: string,
  logs: ScheduleActivityLog[],
  refresh: ScheduleRefresh | undefined,
  vessel: VesselRecord,
): ActivityLogItem[] {
  return [laraSyncItem(id, logs, refresh, vessel)]
}

function terminalOutcome(
  id: string,
  logs: ScheduleActivityLog[],
  refresh: ScheduleRefresh | undefined,
  vessel: VesselRecord,
): ActivityLogItem[] {
  const dataLogs = logs.filter((log) => !isMatchLog(log))
  const items: ActivityLogItem[] = []
  if (refresh?.source === 'Terminal') {
    items.push(terminalItem(id, dataLogs, refresh, vessel))
  } else if (dataLogs.length || (refresh && !logs.some(isMatchLog))) {
    const sync = terminalItem(id, dataLogs, refresh, vessel)
    if (dataLogs.some(hasPriorValue)) {
      items.push(valueUpdateItem(`${id}:update`, 'terminal-update', dataLogs.filter(hasPriorValue).map(changeRow), sync))
    } else {
      items.push(sync)
    }
  }
  for (const log of logs.filter(isMatchLog)) {
    const updatedLabel = log.updatedMatchResult || log.updatedValue
    const originalLabel = log.originalMatchResult || log.originalValue
    const updated = matchedTerminal(vessel, updatedLabel)
    if (updated) {
      items.push(matchItem(`${id}:match:${log.id}`, updated, log.updatedBy === 'System' ? 'Auto' : 'Manual', log))
      continue
    }
    const previous = matchedTerminal(vessel, originalLabel)
    if (!previous) continue
    items.push(matchItem(`${id}:match:${log.id}`, previous, 'Cancel', log))
  }
  return items
}

function matchItem(
  id: string,
  record: TerminalSchedule,
  mode: 'Auto' | 'Manual' | 'Cancel',
  log: ScheduleActivityLog,
): ActivityLogItem {
  const summary = [record.evoyage, record.ivoyage, record.terminal].filter(Boolean).join(' · ')
  const headline = mode === 'Cancel' ? 'Cancel match' : mode === 'Auto' ? 'Auto match' : 'Manual match'
  return {
    id,
    category: 'terminal-match',
    at: log.updatedTime,
    updatedBy: log.updatedBy,
    reason: log.reason,
    headline,
    facts: [{ label: 'Match', value: `${mode} · ${summary || '—'}` }],
    detailTitle: 'Match',
    domainTables: [candidateTable([record], 'Match')],
    changes: [],
    association: [],
    resultNote: '',
  }
}

function hasPriorValue(log: ScheduleActivityLog) {
  const original = isMatchLog(log) ? log.originalMatchResult : log.originalValue
  return Boolean(original.trim())
}

function matchedTerminal(vessel: VesselRecord, label: string) {
  const parsed = label.match(/^Export\s+(.*?)\s+·\s+Import\s+(.*?)\s+·\s+(.*)$/)
  if (!parsed) return undefined
  const exportVoyage = parsed[1]?.trim() ?? ''
  const importVoyage = parsed[2]?.trim() ?? ''
  const terminal = parsed[3]?.trim() ?? ''
  if (!exportVoyage || exportVoyage === '—') return undefined
  const live = vessel.terminalCandidates.find((candidate) => candidate.evoyage === exportVoyage && candidate.terminal === terminal)
    ?? vessel.terminalCandidates.find((candidate) => candidate.evoyage === exportVoyage)
    ?? (vessel.terminalSchedule?.evoyage === exportVoyage ? vessel.terminalSchedule : undefined)
  if (live) return live
  return {
    status: null,
    vesselNameEn: null,
    vesselNameCn: null,
    shipCode: null,
    shipName: null,
    agentCode: null,
    agentName: null,
    lineCode: null,
    terminal: terminal === '—' ? null : terminal,
    portsEn: null,
    portsCn: null,
    eta: null,
    ata: null,
    etb: null,
    atb: null,
    etd: null,
    atd: null,
    cyOpen: null,
    cyClosing: null,
    portCloseDate: null,
    customsCloseDate: null,
    updateTime: null,
    ivoyage: importVoyage === '—' ? null : importVoyage,
    evoyage: exportVoyage,
  }
}

function laraSyncItem(
  id: string,
  logs: ScheduleActivityLog[],
  refresh: ScheduleRefresh | undefined,
  vessel: VesselRecord,
): ActivityLogItem {
  const first = logs[0]!
  const failed = refresh?.result === 'Failed'
  const scope = refresh?.trigger === 'Manual' ? 'Single' : 'Batch'
  const key = callKey(first, vessel)
  const changed = logs.filter((log) => !isMatchLog(log))
  return {
    id,
    category: 'lara-sync',
    at: refresh?.refreshTime || first.updatedTime,
    updatedBy: refresh?.updatedBy || first.updatedBy || 'System',
    reason: '',
    headline: failed ? 'LARA sync failed' : 'LARA sync succeeded',
    facts: [
      { label: 'Primary key', value: key },
      { label: 'Scope', value: scope },
      { label: 'Result', value: failed ? 'Failed' : 'Succeeded' },
    ],
    detailTitle: 'LARA',
    domainTables: [],
    changes: changed.map(changeRow),
    association: [],
    resultNote: failed ? refresh?.failureSource || 'LARA sync failed. The schedule still shows the last successful data.' : '',
  }
}

function applyLaraSnapshots(items: ActivityLogItem[]) {
  const ordered = [...items].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const state = new Map<string, string>()
  for (const item of ordered) {
    if (item.resultNote) {
      item.domainTables = []
      item.changes = []
      continue
    }
    for (const change of item.changes) state.set(change.field, change.value)
    const present = LARA_SNAPSHOT_FIELDS.filter((field) => state.has(field))
    item.domainTables = [{
      id: `${item.id}:lara`,
      title: 'LARA',
      columns: present.map((field) => ({ id: field, label: historyFieldLabel(field) })),
      records: [{
        id: `${item.id}:record`,
        values: present.map((field) => blankValue(state.get(field) ?? '')),
      }],
    }]
    item.changes = []
  }
}

function terminalItem(
  id: string,
  logs: ScheduleActivityLog[],
  refresh: ScheduleRefresh | undefined,
  vessel: VesselRecord,
): ActivityLogItem {
  const first = logs[0]
  const failed = refresh?.result === 'Failed'
  const match = logs.find(isMatchLog)
  const terminalChanges = logs.filter((log) => !isMatchLog(log) && columnSource(log.field) === 'terminal')
  const notFound = terminalChanges.some((log) => /not found/i.test(log.updatedValue))
    || /no terminal/i.test(match?.updatedMatchResult ?? '')
    || (logs.length === 0 && vessel.terminalCandidates.length === 0)
  const result = failed ? 'Failed' : notFound ? 'Not found' : 'Found'
  const at = refresh?.refreshTime || first?.updatedTime || ''
  const key = first
    ? callKey(first, vessel)
    : [vessel.laraVoyage, vessel.pointCode, vessel.laraPoolLocation, vessel.visitNo].filter(Boolean).join(' · ')
  return {
    id,
    category: 'terminal-sync',
    at,
    updatedBy: refresh?.updatedBy || first?.updatedBy || 'System',
    reason: [...new Set(logs.map((log) => log.reason).filter(Boolean))].join('; '),
    headline: failed ? 'Terminal sync failed' : notFound ? 'No terminal record' : 'Terminal sync',
    facts: [
      { label: 'Primary key', value: key || '—' },
      { label: 'Result', value: result },
      { label: 'Records', value: '—' },
    ],
    detailTitle: 'Terminal',
    domainTables: [],
    changes: [...terminalChanges.map(changeRow), ...(match ? [changeRow(match)] : [])],
    association: [],
    resultNote: failed
      ? refresh?.failureSource || 'Terminal call failed.'
      : notFound
        ? 'No terminal record was returned.'
        : '',
  }
}

function applyTerminalTables(items: ActivityLogItem[], vessel: VesselRecord) {
  const ordered = [...items].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const state = new Map<string, string>()
  for (const item of ordered) {
    if (item.resultNote) {
      item.domainTables = []
      item.changes = []
      continue
    }
    for (const change of item.changes) state.set(change.field, change.value)
    const synced = vessel.terminalCandidates.length
      ? [candidateTable(vessel.terminalCandidates)]
      : [valueTable(`${item.id}:terminal`, 'Terminal', state)]
    item.domainTables = synced
    item.facts = item.facts.map((fact) =>
      fact.label === 'Records' ? { ...fact, value: String(synced[0]?.records.length ?? 0) } : fact,
    )
    item.changes = []
  }
}

function valueTable(id: string, title: string, state: Map<string, string>): ActivityDomainTable {
  const entries = [...state.entries()]
  return {
    id,
    title,
    columns: entries.map(([field]) => ({ id: field, label: historyFieldLabel(field) })),
    records: [{
      id: `${id}:record`,
      values: entries.map(([, value]) => blankValue(value)),
    }],
  }
}

const CANDIDATE_COLUMNS: { id: string; label: string; read: (candidate: TerminalSchedule) => string | null }[] = [
  { id: 'status', label: 'Status', read: (candidate) => candidate.status },
  { id: 'vesselNameEn', label: 'Vessel name EN', read: (candidate) => candidate.vesselNameEn },
  { id: 'vesselNameCn', label: 'Vessel name Cn', read: (candidate) => candidate.vesselNameCn },
  { id: 'ivoyage', label: 'Import voyage', read: (candidate) => candidate.ivoyage },
  { id: 'evoyage', label: 'Export voyage', read: (candidate) => candidate.evoyage },
  { id: 'terminal', label: 'Terminal', read: (candidate) => candidate.terminal },
  { id: 'eta', label: 'ETA', read: (candidate) => candidate.eta },
  { id: 'etb', label: 'ETB', read: (candidate) => candidate.etb },
  { id: 'etd', label: 'ETD', read: (candidate) => candidate.etd },
  { id: 'atb', label: 'ATB', read: (candidate) => candidate.atb },
  { id: 'atd', label: 'ATD', read: (candidate) => candidate.atd },
  { id: 'cyOpen', label: 'CY open', read: (candidate) => candidate.cyOpen },
  { id: 'cyClosing', label: 'CY cutoff', read: (candidate) => candidate.cyClosing },
]

function candidateTable(candidates: TerminalSchedule[], title = 'Terminal'): ActivityDomainTable {
  const columns = CANDIDATE_COLUMNS.filter((column) =>
    candidates.some((candidate) => column.read(candidate)?.trim()),
  )
  return {
    id: 'terminal-records',
    title,
    columns: columns.map((column) => ({ id: column.id, label: column.label })),
    records: candidates.map((candidate, index) => ({
      id: `candidate-${index}`,
      values: columns.map((column) => blankValue(column.read(candidate) ?? '')),
    })),
  }
}

function valueUpdateItem(
  id: string,
  category: 'lara-update' | 'terminal-update',
  changes: ActivityValueRow[],
  sync: ActivityLogItem,
): ActivityLogItem {
  const labels = changes.map((change) => change.label)
  return {
    id,
    category,
    at: sync.at,
    updatedBy: sync.updatedBy,
    reason: sync.reason,
    headline: category === 'lara-update' ? `LARA updated · ${labels.join(', ')}` : `Terminal updated · ${labels.join(', ')}`,
    facts: [{ label: 'Fields', value: labels.join(', ') }],
    detailTitle: 'Field changes',
    domainTables: [],
    changes,
    association: [],
    resultNote: '',
  }
}

function changeItem(
  id: string,
  category: 'lara-update' | 'terminal-update',
  logs: ScheduleActivityLog[],
): ActivityLogItem {
  const first = logs[0]!
  const changes = logs.map(changeRow)
  const created = changes.every((change) => !change.original || change.original === '—')
  const labels = changes.map((change) => change.label)
  const restored = changes.length === 1 && /restore|source/i.test(first.reason)
  const headline = category === 'lara-update'
    ? created
      ? 'Vessel created'
      : restored
        ? 'LARA field restored'
        : `LARA updated · ${labels.join(', ')}`
    : created
      ? 'Terminal information added'
      : `Terminal updated · ${labels.join(', ')}`
  const entered = new Map(changes.map((change) => [change.field, change.value]))
  return {
    id,
    category: created ? (category === 'lara-update' ? 'lara-create' : 'terminal-create') : category,
    at: first.updatedTime,
    updatedBy: first.updatedBy,
    reason: [...new Set(logs.map((log) => log.reason).filter(Boolean))].join('; '),
    headline,
    facts: [
      { label: 'Fields', value: labels.join(', ') || '—' },
      { label: 'Updated by', value: first.updatedBy || '—' },
      { label: 'Reason', value: blankValue(first.reason) },
    ],
    detailTitle: created ? (category === 'lara-update' ? 'LARA' : 'Terminal') : 'Field changes',
    domainTables: created ? [valueTable(id, category === 'lara-update' ? 'LARA' : 'Terminal', entered)] : [],
    changes: created ? [] : changes,
    association: [],
    resultNote: '',
  }
}

function linkItem(id: string, logs: ScheduleActivityLog[], vessels: VesselRecord[]): ActivityLogItem {
  const link = logs.find((log) => log.field === 'laraLink')
  const sourceLink = logs.find((log) => log.field === 'laraLinkSource')
  const anchor = link ?? sourceLink
  const counterpartyLog = sourceLink ?? link
  const counterparty = (counterpartyLog?.updatedValue || counterpartyLog?.originalValue || '').trim()
  const party = counterparty ? vessels.find((row) => laraLinkKey(row) === counterparty) : undefined
  const partyTitle = sourceLink ? 'Source' : 'Target'
  return {
    id,
    at: anchor!.updatedTime,
    updatedBy: anchor!.updatedBy,
    reason: [...new Set(logs.map((log) => log.reason).filter(Boolean))].join('; '),
    category: 'lara-link',
    headline: 'Linked to LARA',
    facts: [
      { label: 'Action', value: 'Linked' },
      ...(counterparty ? [{ label: 'Counterparty', value: counterparty }] : []),
      { label: 'Updated by', value: anchor!.updatedBy || '—' },
      { label: 'Reason', value: blankValue(anchor!.reason) },
    ],
    detailTitle: partyTitle,
    domainTables: party ? [laraPartyTable(`${id}:party`, partyTitle, party)] : [{
      id: `${id}:link`,
      title: partyTitle,
      columns: [
        { id: 'action', label: 'Action' },
        { id: 'counterparty', label: 'Counterparty' },
      ],
      records: [{
        id: `${id}:record`,
        values: ['Linked', blankValue(counterparty)],
      }],
    }],
    changes: [],
    association: [{ label: 'Counterparty', value: blankValue(counterparty) }],
    resultNote: '',
  }
}

function laraPartyTable(id: string, title: string, vessel: VesselRecord): ActivityDomainTable {
  return {
    id,
    title,
    columns: LARA_DETAIL_COLUMNS.map((column) => ({ id: column.id, label: column.label })),
    records: [{
      id: `${id}:record`,
      values: LARA_DETAIL_COLUMNS.map((column) => searchCellText(vessel, column.id)),
    }],
  }
}

function changeRow(log: ScheduleActivityLog): ActivityValueRow {
  const original = isMatchLog(log) ? log.originalMatchResult : log.originalValue
  const updated = isMatchLog(log) ? log.updatedMatchResult : log.updatedValue
  return {
    id: log.id,
    field: log.field,
    label: historyFieldLabel(log.field),
    value: blankValue(updated),
    original: blankValue(original),
    changed: true,
  }
}

function terminalRefreshesWithoutLogs(
  vessel: VesselRecord,
  refreshById: (id: string) => ScheduleRefresh | undefined,
  items: ActivityLogItem[],
) {
  const seen = new Set(items.filter((item) => item.category === 'terminal-sync').map((item) => item.id))
  const fromLogs = new Set((vessel.scheduleLogs ?? []).map((log) => log.refreshId).filter(Boolean))
  const refreshes: ScheduleRefresh[] = []
  for (const id of fromLogs) {
    const refresh = refreshById(id)
    if (refresh?.source === 'Terminal' && refresh.result === 'Failed' && !seen.has(`terminal:${refresh.id}`)) {
      refreshes.push(refresh)
    }
  }
  return refreshes
}

/** Same timestamp: earlier step first. Sync, then auto match, then field updates. */
const ACTIVITY_PRIORITY: Record<ActivityCategory, number> = {
  'lara-sync': 0,
  'terminal-sync': 1,
  'terminal-match': 2,
  'lara-create': 3,
  'lara-update': 4,
  'terminal-create': 5,
  'terminal-update': 6,
  'lara-link': 7,
}

export function activityPriority(category: ActivityCategory) {
  return ACTIVITY_PRIORITY[category]
}

export function activityCategoryLabel(category: ActivityCategory) {
  return ACTIVITY_CATEGORIES.find((item) => item.id === category)?.label ?? category
}

/** One-line description for the activity table. Detail stays type-specific. */
export function activityDescription(item: ActivityLogItem) {
  const fact = (label: string) => item.facts.find((entry) => entry.label === label)?.value
  const key = fact('Primary key')
  const present = (value?: string) => (value && value !== '—' ? value : '')
  if (item.category === 'lara-sync') {
    return withReason([present(fact('Scope')), present(fact('Result')), present(key)].filter(Boolean).join(' · '), item.reason)
  }
  if (item.category === 'terminal-match') return withReason(present(fact('Match')) || item.headline, item.reason)
  if (item.category === 'terminal-sync') {
    return withReason(
      [present(fact('Result')), present(fact('Records')) ? `${fact('Records')} records` : '', present(key)].filter(Boolean).join(' · '),
      item.reason,
    )
  }
  if (item.category === 'lara-link') {
    return withReason([item.headline, present(fact('Counterparty'))].filter(Boolean).join(' · '), item.reason)
  }
  return withReason(item.headline, item.reason)
}

function withReason(text: string, reason: string) {
  const note = reason.trim()
  if (!note || text.includes(note)) return text
  return text ? `${text} · ${note}` : note
}

export function activityCategoryShowsField(category: ActivityCategory) {
  return category !== 'lara-link'
}

export function activityCategoryShowsActor(category: ActivityCategory) {
  return category !== 'lara-sync'
}

export function itemTouchesField(item: ActivityLogItem, field: string) {
  const query = field.trim().toLowerCase()
  if (!query) return true
  const rows = [
    ...item.domainTables.flatMap((table) => table.columns.map((column) => ({ label: column.label, field: column.id }))),
    ...item.changes,
  ]
  return rows.some((row) =>
    row.label.toLowerCase().includes(query)
    || row.field.toLowerCase().includes(query)
    || historyFieldMatches(row.field, field),
  )
}
