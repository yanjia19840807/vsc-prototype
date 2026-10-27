import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'

import SearchResultCell from '@/features/vessel-search/SearchResultCell.vue'
import { brandFromVoyage } from '@/domain/lara-brand'
import { mainVoyageText } from '@/domain/main-voyage'
import { laraLinkKey } from '@/features/vessel-schedule/lara-link'
import { formatDateTime } from '@/lib/vessel-utils'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

/**
 * Vessel Search columns.
 * Visual order: LARA → Terminal → Platform.
 * Vessel type and Terminal 9code are calculated, then stored, and shown at the end of LARA.
 */
export type SearchColKind = 'text' | 'datetime' | 'number'
export type ColumnSource = 'lara' | 'terminal' | 'platform'
export type ColumnGroup = ColumnSource

export type SearchColumn = {
  id: string
  label: string
  kind: SearchColKind
  source: ColumnSource
}

export const COLUMN_GROUP_LABEL: Record<ColumnGroup, string> = {
  lara: 'LARA',
  terminal: 'Terminal',
  platform: 'Platform',
}

/** Solid source mark from the theme palette. Shared by the legend and the header rule. */
export const COLUMN_GROUP_MARK: Record<ColumnGroup, string> = {
  lara: 'bg-source-lara',
  terminal: 'bg-source-terminal',
  platform: 'bg-source-platform',
}

/** Neutral header with a solid source rule. The row surface stays free for hover and highlights. */
export const COLUMN_GROUP_CLASS: Record<ColumnGroup, string> = {
  lara: 'bg-card border-t-3 border-source-lara',
  terminal: 'bg-card border-t-3 border-source-terminal',
  platform: 'bg-card border-t-3 border-source-platform',
}

/** LARA, then Terminal, then Platform last. */
export const COLUMN_GROUP_ORDER: ColumnGroup[] = ['lara', 'terminal', 'platform']

/** Shown in the voyage cell. The list cannot hide this column. */
export const LOCKED_COLUMN_ID = 'laraVoyage'

export const SEARCH_COLUMNS: SearchColumn[] = [
  { id: 'mappingStatus', label: 'Mapping status', kind: 'text', source: 'platform' },
  { id: 'lastUpdateBy', label: 'Last modify by', kind: 'text', source: 'platform' },
  { id: 'lastUpdateAt', label: 'Last modify at', kind: 'datetime', source: 'platform' },
  // LARA fields from the schedule template. Calculated columns stay last.
  { id: 'laraVoyage', label: 'Voyage', kind: 'text', source: 'lara' },
  { id: 'pointCode', label: 'Point code', kind: 'text', source: 'lara' },
  { id: 'laraPoolLocation', label: 'Pool location', kind: 'text', source: 'lara' },
  { id: 'vesselName', label: 'Vessel name', kind: 'text', source: 'lara' },
  { id: 'brand', label: 'Brand', kind: 'text', source: 'lara' },
  { id: 'service', label: 'Service', kind: 'text', source: 'lara' },
  { id: 'laraEta', label: 'ETA', kind: 'datetime', source: 'lara' },
  { id: 'laraEtb', label: 'ETB', kind: 'datetime', source: 'lara' },
  { id: 'laraEtd', label: 'ETD', kind: 'datetime', source: 'lara' },
  { id: 'vesselType', label: 'Vessel type', kind: 'text', source: 'lara' },
  { id: 'terminal9code', label: 'Terminal', kind: 'text', source: 'lara' },
  // Terminal fields written by a sync, in display order.
  { id: 'vesselOperator', label: 'Vessel operator', kind: 'text', source: 'terminal' },
  { id: 'localVoyageExport', label: 'Export voyage', kind: 'text', source: 'terminal' },
  { id: 'localVoyageImport', label: 'Import voyage', kind: 'text', source: 'terminal' },
  { id: 'vesselNameCn', label: 'Vessel name Cn', kind: 'text', source: 'terminal' },
  { id: 'terminalName', label: 'Terminal name', kind: 'text', source: 'terminal' },
  { id: 'tmlEta', label: 'ETA', kind: 'datetime', source: 'terminal' },
  { id: 'tmlAta', label: 'ATA', kind: 'datetime', source: 'terminal' },
  { id: 'terminalEtb', label: 'ETB', kind: 'datetime', source: 'terminal' },
  { id: 'terminalAtb', label: 'ATB', kind: 'datetime', source: 'terminal' },
  { id: 'terminalEtd', label: 'ETD', kind: 'datetime', source: 'terminal' },
  { id: 'terminalAtd', label: 'ATD', kind: 'datetime', source: 'terminal' },
  { id: 'cyOpen', label: 'CY open', kind: 'datetime', source: 'terminal' },
  { id: 'cyCutoff', label: 'CY closing', kind: 'datetime', source: 'terminal' },
  { id: 'tmlVslStatus', label: 'Status', kind: 'text', source: 'terminal' },
  { id: 'terminalUpdateTime', label: 'Update time', kind: 'datetime', source: 'terminal' },
]

/** Columns that show an em dash when terminal data is missing or not confirmed. */
const TERMINAL_COLUMNS = new Set([
  'vesselOperator',
  'vesselNameCn',
  'localVoyageExport',
  'localVoyageImport',
  'terminalName',
  'tmlEta',
  'tmlAta',
  'terminalEtb',
  'terminalAtb',
  'terminalEtd',
  'terminalAtd',
  'cyOpen',
  'cyCutoff',
  'tmlVslStatus',
  'terminalUpdateTime',
])

const NOT_FOUND_ALIASES: Record<string, string[]> = {
  terminalEtb: ['tmlEtb', 'terminalEtb', 'etb'],
  terminalEtd: ['tmlEtd', 'terminalEtd', 'etd'],
  terminalAtb: ['tmlAtb', 'terminalAtb', 'atb'],
  terminalAtd: ['tmlAtd', 'terminalAtd', 'atd'],
  tmlEta: ['tmlEta', 'eta'],
  tmlAta: ['tmlAta', 'ata'],
  cyOpen: ['cyOpen'],
  cyCutoff: ['cyCutoff', 'cyClosing'],
  portCloseDate: ['portCloseDate'],
  customsCloseDate: ['customsCloseDate'],
  tmlVslStatus: ['status', 'terminalScheduleStatus'],
  terminal9code: ['terminal'],
  terminalName: ['terminal'],
  terminalUpdateTime: ['updateTime', 'terminalUpdateTime'],
  localVoyageExport: ['externalVoyage', 'externalExportVoyage', 'localVoyageExport', 'evoyage'],
  localVoyageImport: ['externalImportVoyage', 'localVoyageImport', 'ivoyage'],
  vesselNameEn: ['vesselNameEn'],
  vesselNameCn: ['vesselNameCn'],
  vesselOperator: ['vesselOperator'],
  shipCode: ['shipCode'],
  shipName: ['shipName'],
  agentCode: ['agentCode'],
  agentName: ['agentName'],
  lineCode: ['lineCode'],
  portsEn: ['portsEn'],
  portsCn: ['portsCn'],
}

export function historyFieldLabel(field: string) {
  if (field === 'linkState' || field === 'laraLink') return 'Link State'
  if (field === 'remark') return 'Remark'
  if (field === 'voyageStatus') return 'LARA voyage status'
  const direct = SEARCH_COLUMNS.find((column) => column.id === field)
  if (direct) return columnHeaderLabel(direct)
  const aliased = SEARCH_COLUMNS.find((column) => (NOT_FOUND_ALIASES[column.id] ?? []).includes(field))
  return aliased ? columnHeaderLabel(aliased) : field
}

export function historyFieldMatches(field: string, columnId: string) {
  return field === columnId || (NOT_FOUND_ALIASES[columnId] ?? []).includes(field)
}

export const SEARCH_DEFAULT_SORT = [{ id: 'laraEtb', desc: true }]

function brandOf(v: VesselRecord): string {
  return brandFromVoyage(v.laraVoyage) || v.brand || ''
}

function vesselTypeLabel(v: VesselRecord): string {
  return v.vesselTypeLabel || ''
}

const VOYAGE_COLUMNS = new Set(['localVoyageExport', 'localVoyageImport'])

const OVERRIDE_FIELDS: Record<string, string[]> = {
  localVoyageExport: ['evoyage', 'externalVoyage'],
  localVoyageImport: ['ivoyage', 'externalImportVoyage'],
  terminalEtb: ['etb', 'tmlEtb'],
  terminalEtd: ['etd', 'tmlEtd'],
  terminalAtb: ['atb', 'tmlAtb'],
  terminalAtd: ['atd', 'tmlAtd'],
  tmlEta: ['eta', 'tmlEta'],
  tmlAta: ['ata', 'tmlAta'],
  cyOpen: ['cyOpen'],
  cyCutoff: ['cyClosing', 'cyCutoff'],
  portCloseDate: ['portCloseDate'],
  customsCloseDate: ['customsCloseDate'],
  terminal9code: ['terminal'],
  terminalName: ['terminal'],
}

function unconfirmedOrTerminal(
  v: VesselRecord,
  value: string | null | undefined,
) {
  if (isUnconfirmedMatch(v) && !v.terminalSchedule) return candidateCountLabel(v)
  return value || ''
}

/** No terminal schedule was kept, so the Terminal pane must not borrow vessel-level defaults. */
function terminalRecordAbsent(v: VesselRecord) {
  return v.matchingStatus === 'No terminal record' && v.terminalSource !== 'manual'
}

export function isMissingExternalVoyage(v: VesselRecord) {
  return v.matchingStatus === 'No external voyage'
}

/** Match found but not confirmed. Terminal cells show an em dash. */
export function isUnconfirmedMatch(v: VesselRecord) {
  return v.matchingStatus === 'Multiple terminal records' || v.matchingStatus === 'ETD gap > 3 days'
}

export function candidateCountLabel(v: VesselRecord) {
  const count = v.terminalCandidates.length
  return count === 1 ? '1 candidate' : `${count} candidates`
}

/** Remark beside Auto matched when several vessel schedules share one terminal record. */
export function sharedLaraRemark(count: number) {
  if (count <= 1) return ''
  return `${count} LARA records`
}

export function manualOverrideFor(v: VesselRecord, columnId: string) {
  for (const field of OVERRIDE_FIELDS[columnId] ?? []) {
    const override = v.manualOverrides[field]
    if (override) return override
  }
  return undefined
}

/** Whether the vessel's LARA point code is sent to the terminal schedule API. */
export function isPortApiCovered(v: VesselRecord): boolean {
  const port = useTerminalCoverageStore().ports.find((row) => row.portCode === v.pointCode)
  return Boolean(port?.apiCovered)
}

/** Non-API covered ports show a dash in terminal columns. Manual entry still shows. */
export function isApiFieldHidden(v: VesselRecord, id: string) {
  if (!TERMINAL_COLUMNS.has(id)) return false
  if (v.terminalSource === 'manual' || manualOverrideFor(v, id)) return false
  const port = useTerminalCoverageStore().ports.find((row) => row.portCode === v.pointCode)
  return !port?.apiCovered
}

export function brdTerminal(v: VesselRecord): { code: string; name: string } {
  const row = useTerminalCoverageStore().resolveTerminal(v.pointCode, v.terminalSchedule?.terminal)
  if (!row) return { code: '', name: '' }
  return {
    code: row.pool,
    name: row.nameZh || row.abbr || row.pool,
  }
}

function updateStamp(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) return parsed
  const normalized = Date.parse(value.replace(' ', 'T'))
  return Number.isNaN(normalized) ? Number.NEGATIVE_INFINITY : normalized
}

function isSystemActor(by: string) {
  return by.trim().toLowerCase() === 'system'
}

/** Latest schedule write. A system sync is shown as an empty value. */
function lastScheduleUpdate(v: VesselRecord) {
  let by = ''
  let at = ''
  let time = Number.NEGATIVE_INFINITY
  const consider = (nextBy: string, nextAt: string) => {
    const next = updateStamp(nextAt)
    if (!nextAt || next < time) return
    time = next
    by = nextBy
    at = nextAt
  }
  for (const entry of v.history ?? []) consider(entry.by, entry.at)
  for (const log of v.scheduleLogs ?? []) consider(log.updatedBy, log.updatedTime)
  if (isSystemActor(by)) return { by: '', at: '' }
  return { by, at }
}

/** Sortable raw value. Datetimes stay ISO; empty text sorts as ''. */
export function searchSortValue(v: VesselRecord, id: string): string | number {
  if (isApiFieldHidden(v, id)) return ''
  const terminal = brdTerminal(v)
  switch (id) {
    case 'vesselType':
      return vesselTypeLabel(v)
    case 'vesselOperator':
      if (terminalRecordAbsent(v)) return ''
      return v.vesselOperator || ''
    case 'brand':
      return brandOf(v)
    case 'service':
      return v.service || ''
    case 'pointCode':
      return v.pointCode
    case 'vesselName':
      return v.vesselName
    case 'laraSyncTime':
      return v.laraSyncTime || ''
    case 'laraVoyage':
      return v.laraVoyage || ''
    case 'visitNo':
      return v.visitNo || ''
    case 'multipleCallNumber':
      return v.multipleCallNumber || ''
    case 'acPartner':
      return v.acPartner || ''
    case 'cutoff':
      return v.cutoff || ''
    case 'terminalUpdateTime':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.updateTime)
    case 'localVoyageExport':
      if (isUnconfirmedMatch(v)) return candidateCountLabel(v)
      return v.terminalSchedule?.evoyage || ''
    case 'localVoyageImport':
      if (isUnconfirmedMatch(v)) return candidateCountLabel(v)
      return v.terminalSchedule?.ivoyage || ''
    case 'voyageStatus':
      return v.omit || v.voyageStatus === 'Omit' ? 'omit' : v.voyageStatus
    case 'isMainVoyage':
      return mainVoyageText(v)
    case 'laraPoolLocation':
      return v.laraPoolLocation || ''
    case 'terminal9code':
      return v.terminal9code || ''
    case 'terminalName':
      if (isUnconfirmedMatch(v) && !v.terminalSchedule) return candidateCountLabel(v)
      return terminal.name
    case 'vesselNameEn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.vesselNameEn)
    case 'vesselNameCn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.vesselNameCn)
    case 'shipCode':
      if (terminalRecordAbsent(v)) return ''
      return unconfirmedOrTerminal(v, v.terminalSchedule?.shipCode ?? v.shipCode)
    case 'shipName':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.shipName)
    case 'agentCode':
      if (terminalRecordAbsent(v)) return ''
      return unconfirmedOrTerminal(v, v.terminalSchedule?.agentCode ?? v.agentCode)
    case 'agentName':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.agentName)
    case 'lineCode':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.lineCode)
    case 'portsEn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.portsEn)
    case 'portsCn':
      if (terminalRecordAbsent(v)) return ''
      return unconfirmedOrTerminal(v, v.terminalSchedule?.portsCn ?? v.portsOfCall)
    case 'laraEta':
      return v.laraEta || ''
    case 'laraEtb':
      return v.laraEtb || ''
    case 'laraEtd':
      return v.laraEtd || ''
    case 'tmlEta':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.eta)
    case 'tmlAta':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.ata)
    case 'mappingStatus':
      return matchingStatusLabel(v.matchingStatus)
    case 'lastUpdateBy':
      return lastScheduleUpdate(v).by
    case 'lastUpdateAt':
      return lastScheduleUpdate(v).at
    case 'laraLink': {
      const ids = v.laraLinkTargetIds?.length
        ? v.laraLinkTargetIds
        : [v.laraLinkTargetId || v.laraLinkSourceId].filter((id): id is string => Boolean(id))
      if (!ids.length) return ''
      return ids
        .map((id) => {
          const linked = useVesselStore().byId(id)
          return linked ? laraLinkKey(linked) : ''
        })
        .filter(Boolean)
        .join(', ')
    }
    case 'lastRefreshTime':
      return v.lastRefreshTime || ''
    case 'tmlVslStatus':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.status)
    case 'terminalEtb':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.etb)
    case 'terminalEtd':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.etd)
    case 'terminalAtb':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.atb)
    case 'terminalAtd':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.atd)
    case 'cyOpen':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.cyOpen)
    case 'cyCutoff':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.cyClosing)
    case 'portCloseDate':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.portCloseDate)
    case 'customsCloseDate':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.customsCloseDate)
    default:
      return ''
  }
}

function isNotFound(v: VesselRecord, id: string) {
  if (isUnconfirmedMatch(v) && VOYAGE_COLUMNS.has(id)) return false
  if (isMissingExternalVoyage(v) && VOYAGE_COLUMNS.has(id)) return true
  if (v.rowNotFound && TERMINAL_COLUMNS.has(id)) return true
  const aliases = NOT_FOUND_ALIASES[id] ?? [id]
  if (v.notFoundFields?.some((field) => aliases.includes(field))) return true
  if (!TERMINAL_COLUMNS.has(id)) return false
  if (isUnconfirmedMatch(v) && !v.terminalSchedule) return false
  return searchSortValue(v, id) === ''
}

export function searchCellText(v: VesselRecord, id: string): string {
  if (isApiFieldHidden(v, id)) return '—'
  if (isUnconfirmedMatch(v) && TERMINAL_COLUMNS.has(id)) return '—'
  if (isNotFound(v, id)) return '—'
  const column = SEARCH_COLUMNS.find((col) => col.id === id)
  const raw = searchSortValue(v, id)
  if (column?.kind === 'datetime') return formatDateTime(String(raw))
  if (raw === '' || raw == null) return '—'
  return String(raw)
}

/** Mapping status labels are the stored values. */
export function matchingStatusLabel(status: string): string {
  return status
}

/** Cell values that should render with warning semantic color. */
export function isWarningCellText(text: string, _columnId?: string) {
  return text === 'Unconfirmed' || text === 'Not found' || text === 'Not Found'
}

function logOriginal(log: VesselRecord['scheduleLogs'][number]) {
  const match = Boolean(log.originalMatchResult || log.updatedMatchResult)
  return (match ? log.originalMatchResult : log.originalValue).trim()
}

/** Later edits only. The first write from empty is the field arriving, not a change. */
export function fieldChangeLogs(v: VesselRecord, id: string) {
  const logs = (v.scheduleLogs ?? [])
    .filter((log) => historyFieldMatches(log.field, id))
    .slice()
    .sort((left, right) => {
      const time = new Date(left.updatedTime).getTime() - new Date(right.updatedTime).getTime()
      if (time !== 0) return time
      return Number(Boolean(logOriginal(right))) - Number(Boolean(logOriginal(left)))
    })
  if (logs[0] && !logOriginal(logs[0])) logs.shift()
  return logs.reverse()
}

export function columnHasHistory(v: VesselRecord, id: string) {
  return fieldChangeLogs(v, id).length > 0
}

export function columnGroup(id: string): ColumnGroup {
  return SEARCH_COLUMNS.find((item) => item.id === id)?.source ?? 'lara'
}

/** Lowercase the first word after a prefix. Leave acronyms such as ETB and CY as written. */
function prefixedLabel(prefix: string, label: string): string {
  const first = label.split(' ')[0] ?? ''
  const acronym = first === first.toUpperCase() && /[A-Z]/.test(first)
  const rest = acronym ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`
  return `${prefix} ${rest}`
}

/** LARA and Terminal headers are prefixed. Platform headers are not. */
export function columnHeaderLabel(column: Pick<SearchColumn, 'id' | 'label' | 'source'>): string {
  if (column.id === 'terminal9code') return 'Terminal 9code'
  if (column.id === 'terminalName') return 'Terminal name'
  if (column.source === 'lara') return prefixedLabel('LARA', column.label)
  if (column.source === 'terminal') return prefixedLabel('Terminal', column.label)
  return column.label
}

export function columnHeaderLabelById(id: string): string {
  const column = SEARCH_COLUMNS.find((item) => item.id === id)
  return column ? columnHeaderLabel(column) : id
}

/**
 * Keep each visual group together per COLUMN_GROUP_ORDER.
 * Prefer the caller's relative order within a group; fall back to SEARCH_COLUMNS.
 */
export function groupColumnOrder(order: string[]): string[] {
  const buckets: Record<ColumnGroup, string[]> = {
    lara: [],
    terminal: [],
    platform: [],
  }
  const seen = new Set<string>()
  for (const id of order) {
    if (!SEARCH_COLUMNS.some((column) => column.id === id) || seen.has(id)) continue
    buckets[columnGroup(id)].push(id)
    seen.add(id)
  }
  for (const column of SEARCH_COLUMNS) {
    if (!seen.has(column.id)) buckets[column.source].push(column.id)
  }
  const laraTail = ['vesselType', 'terminal9code']
  buckets.lara = [
    ...buckets.lara.filter((id) => !laraTail.includes(id)),
    ...laraTail.filter((id) => buckets.lara.includes(id)),
  ]
  return COLUMN_GROUP_ORDER.flatMap((group) => buckets[group])
}

function leafDef(column: SearchColumn): ColumnDef<any, any> {
  return {
    id: column.id,
    header: columnHeaderLabel(column),
    enableSorting: true,
    enableHiding: column.id !== LOCKED_COLUMN_ID,
    accessorFn: (row: VesselRecord) => searchSortValue(row, column.id),
    cell: ({ row }) => h(SearchResultCell, { vessel: row.original as VesselRecord, columnId: column.id }),
    ...(column.kind === 'datetime' ? { sortFn: 'datetime' as const } : {}),
  }
}

export function searchColumnDefs(): ColumnDef<any, any>[] {
  return SEARCH_COLUMNS.map(leafDef)
}

/** Flat search columns in visual group order, with Actions last. */
export function groupedSearchColumnDefs(order: string[]): ColumnDef<any, any>[] {
  const byId = new Map(SEARCH_COLUMNS.map((column) => [column.id, column]))
  const leaves: ColumnDef<any, any>[] = []
  for (const id of groupColumnOrder(order)) {
    const column = byId.get(id)
    if (column) leaves.push(leafDef(column))
  }
  leaves.push({
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    enableHiding: false,
  })
  return leaves
}
