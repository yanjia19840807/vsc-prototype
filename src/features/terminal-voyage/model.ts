import type { ScheduleState, TerminalPayload } from '@/domain/schedule-model'
import type { FilterFieldDef, FilterState } from '@/features/vessel-search/list-setting-model'
import { emptyFilterState } from '@/features/vessel-search/list-setting-model'
import type { TerminalSchedule, VesselRecord } from '@/types/vsc'

/** Fields returned by the port terminal API, in response order. */
export const TERMINAL_VOYAGE_FIELDS = [
  'status',
  'vesselNameEn',
  'vesselNameCn',
  'shipCode',
  'shipName',
  'agentCode',
  'agentName',
  'lineCode',
  'terminal',
  'portsEn',
  'portsCn',
  'eta',
  'ata',
  'etb',
  'atb',
  'etd',
  'atd',
  'cyOpen',
  'cyClosing',
  'portCloseDate',
  'customsCloseDate',
  'updateTime',
  'ivoyage',
  'evoyage',
] as const satisfies ReadonlyArray<keyof TerminalSchedule>

export type TerminalVoyageField = (typeof TERMINAL_VOYAGE_FIELDS)[number]

const DATE_FIELDS = new Set<TerminalVoyageField>([
  'eta',
  'ata',
  'etb',
  'atb',
  'etd',
  'atd',
  'cyOpen',
  'cyClosing',
  'portCloseDate',
  'customsCloseDate',
  'updateTime',
])

export type TerminalVoyageColumn = {
  id: TerminalVoyageField
  label: string
  kind: 'text' | 'datetime'
}

export const TERMINAL_VOYAGE_COLUMNS: TerminalVoyageColumn[] = [
  { id: 'ivoyage', label: 'Import voyage', kind: 'text' },
  { id: 'evoyage', label: 'Export voyage', kind: 'text' },
  { id: 'status', label: 'Status', kind: 'text' },
  { id: 'vesselNameEn', label: 'Vessel name', kind: 'text' },
  { id: 'vesselNameCn', label: 'Vessel name CN', kind: 'text' },
  { id: 'shipCode', label: 'Ship code', kind: 'text' },
  { id: 'shipName', label: 'Ship name', kind: 'text' },
  { id: 'agentCode', label: 'Agent code', kind: 'text' },
  { id: 'agentName', label: 'Agent name', kind: 'text' },
  { id: 'lineCode', label: 'Line code', kind: 'text' },
  { id: 'terminal', label: 'Terminal', kind: 'text' },
  { id: 'portsEn', label: 'Ports', kind: 'text' },
  { id: 'portsCn', label: 'Ports Cn', kind: 'text' },
  { id: 'eta', label: 'ETA', kind: 'datetime' },
  { id: 'ata', label: 'ATA', kind: 'datetime' },
  { id: 'etb', label: 'ETB', kind: 'datetime' },
  { id: 'atb', label: 'ATB', kind: 'datetime' },
  { id: 'etd', label: 'ETD', kind: 'datetime' },
  { id: 'atd', label: 'ATD', kind: 'datetime' },
  { id: 'cyOpen', label: 'CY open', kind: 'datetime' },
  { id: 'cyClosing', label: 'CY closing', kind: 'datetime' },
  { id: 'portCloseDate', label: 'Port close', kind: 'datetime' },
  { id: 'customsCloseDate', label: 'Customs close', kind: 'datetime' },
  { id: 'updateTime', label: 'Update time', kind: 'datetime' },
]

/** Import voyage, then export voyage, stay pinned while the rest of the row scrolls. */
export const LOCKED_TERMINAL_VOYAGE_COLUMNS = ['ivoyage', 'evoyage'] as const

/** Port code is the port the sync asked. Region is that port's region. Neither is a column. */
export type TerminalVoyageRow = TerminalSchedule & {
  id: string
  portCode: string
  regionCode: string
}

export const TERMINAL_VOYAGE_FILTERS: FilterFieldDef[] = [
  { id: 'vesselName', label: 'Vessel name', kind: 'lines' },
  { id: 'voyage', label: 'Voyage', kind: 'lines' },
  { id: 'region', label: 'Region', kind: 'multi', optionSource: 'region' },
  { id: 'portCode', label: 'Port code', kind: 'multi', optionSource: 'pointCode' },
  { id: 'status', label: 'Status', kind: 'multi', optionSource: 'tmlVslStatus' },
  { id: 'eta', label: 'ETA', kind: 'datetime' },
  { id: 'ata', label: 'ATA', kind: 'datetime' },
  { id: 'etb', label: 'ETB', kind: 'datetime' },
  { id: 'atb', label: 'ATB', kind: 'datetime' },
  { id: 'etd', label: 'ETD', kind: 'datetime' },
  { id: 'atd', label: 'ATD', kind: 'datetime' },
]

export function emptyTerminalVoyageQuery(): Record<string, FilterState> {
  const session: Record<string, FilterState> = {}
  for (const field of TERMINAL_VOYAGE_FILTERS) session[field.id] = emptyFilterState(field.kind)
  return session
}

export function terminalVoyageColumn(id: string) {
  return TERMINAL_VOYAGE_COLUMNS.find((column) => column.id === id)
}

export function terminalVoyageSortValue(row: TerminalVoyageRow, id: TerminalVoyageField) {
  return row[id] ?? ''
}

export function isTerminalVoyageDate(id: string) {
  return DATE_FIELDS.has(id as TerminalVoyageField)
}

/** Latest terminal_payload rows. Same port, English name, and both voyages collapse to one payload id. */
export function terminalVoyageRows(state: ScheduleState, vessels: VesselRecord[]): TerminalVoyageRow[] {
  const vesselsById = new Map(vessels.map((vessel) => [vessel.id, vessel]))
  const seen = new Set<string>()
  const rows: TerminalVoyageRow[] = []
  for (const schedule of state.schedules) {
    const vessel = vesselsById.get(schedule.id)
    if (!vessel) continue
    for (const payload of latestFoundPayloads(state, schedule.id)) {
      const message = messageFor(vessel, payload)
      if (!hasTerminalContent(message)) continue
      const key = voyageIdentity(vessel.pointCode, message)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        id: payload.id,
        portCode: vessel.pointCode,
        regionCode: vessel.region,
        ...message,
      })
    }
  }
  return rows
}

export function findTerminalVoyage(state: ScheduleState, vessels: VesselRecord[], id: string) {
  return terminalVoyageRows(state, vessels).find((row) => row.id === id)
}

function latestFoundPayloads(state: ScheduleState, scheduleId: string) {
  const query = [...state.terminalQueries].reverse().find(
    (item) => item.scheduleId === scheduleId && (item.status === 'FOUND' || item.status === 'NOT_FOUND'),
  )
  if (!query || query.status !== 'FOUND') return []
  return state.terminalPayloads.filter((payload) => payload.queryId === query.id)
}

function messageFor(vessel: VesselRecord, payload: TerminalPayload): TerminalSchedule {
  const matched = [vessel.terminalSchedule, ...vessel.terminalCandidates].find((row) =>
    row
    && (row.evoyage ?? '') === payload.exportVoyage
    && (row.ivoyage ?? '') === payload.importVoyage,
  )
  return {
    status: payload.vesselStatus || matched?.status || null,
    vesselNameEn: matched?.vesselNameEn || vessel.vesselName || null,
    vesselNameCn: payload.vesselNameCn || matched?.vesselNameCn || null,
    shipCode: matched?.shipCode ?? null,
    shipName: matched?.shipName ?? null,
    agentCode: matched?.agentCode ?? null,
    agentName: matched?.agentName ?? null,
    lineCode: matched?.lineCode ?? null,
    terminal: matched?.terminal || payload.terminalName || null,
    portsEn: matched?.portsEn ?? null,
    portsCn: matched?.portsCn ?? null,
    eta: payload.eta || null,
    ata: payload.ata || null,
    etb: payload.etb || null,
    atb: payload.atb || null,
    etd: payload.etd || null,
    atd: payload.atd || null,
    cyOpen: payload.cyOpen || null,
    cyClosing: payload.cyCutoff || null,
    portCloseDate: matched?.portCloseDate ?? null,
    customsCloseDate: matched?.customsCloseDate ?? null,
    updateTime: payload.updateTime || null,
    ivoyage: payload.importVoyage || null,
    evoyage: payload.exportVoyage || null,
  }
}

function voyageIdentity(portCode: string, message: TerminalSchedule) {
  return [
    portCode.trim().toUpperCase(),
    (message.vesselNameEn ?? '').trim().toLowerCase(),
    (message.evoyage ?? '').trim().toLowerCase(),
    (message.ivoyage ?? '').trim().toLowerCase(),
  ].join('\0')
}

export function terminalVoyageMatches(row: TerminalVoyageRow, session: Record<string, FilterState>) {
  for (const field of TERMINAL_VOYAGE_FILTERS) {
    const state = session[field.id] ?? emptyFilterState(field.kind)
    if (!filterMatches(row, field, state)) return false
  }
  return true
}

function filterMatches(row: TerminalVoyageRow, field: FilterFieldDef, state: FilterState) {
  if (field.id === 'vesselName') return matchesAny(state.values, [row.vesselNameEn, row.vesselNameCn])
  if (field.id === 'voyage') return matchesAny(state.values, [row.evoyage, row.ivoyage])
  if (field.id === 'region') {
    if (!state.values.length) return true
    return state.values.includes(row.regionCode)
  }
  if (field.id === 'portCode') {
    if (!state.values.length) return true
    return state.values.includes(row.portCode)
  }
  if (field.id === 'status') {
    if (!state.values.length) return true
    return state.values.includes(row.status ?? '')
  }
  if (field.kind === 'datetime') return inDateRange(row[field.id as TerminalVoyageField], state.from, state.to)
  return true
}

function matchesAny(wanted: string[], values: Array<string | null | undefined>) {
  const lines = wanted.map((value) => value.trim().toLowerCase()).filter(Boolean)
  if (!lines.length) return true
  const present = values.map((value) => (value ?? '').trim().toLowerCase()).filter(Boolean)
  return present.some((value) => lines.includes(value))
}

function hasTerminalContent(schedule: TerminalSchedule) {
  return TERMINAL_VOYAGE_FIELDS.some((field) => String(schedule[field] ?? '').trim())
}

function localDay(date: string, endOfDay: boolean) {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return Number.NaN
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0).getTime()
}

function inDateRange(raw: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true
  const text = String(raw ?? '')
  if (!text) return false
  const value = new Date(text).getTime()
  if (!Number.isFinite(value)) return false
  const start = from ? localDay(from, false) : Number.NEGATIVE_INFINITY
  const end = to ? localDay(to, true) : Number.POSITIVE_INFINITY
  if (Number.isNaN(start) || Number.isNaN(end)) return false
  return value >= start && value <= end
}
