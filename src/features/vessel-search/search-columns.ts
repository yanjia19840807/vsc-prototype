import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'

import SearchResultCell from '@/features/vessel-search/SearchResultCell.vue'
import { laraLinkKey } from '@/features/vessel-schedule/lara-link'
import { formatDateTime } from '@/lib/vessel-utils'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

/**
 * Vessel Search columns.
 * Visual order: LARA → Terminal → Platform.
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

/** Header swatches. Shared by the search table and its source legend. */
export const COLUMN_GROUP_CLASS: Record<ColumnGroup, string> = {
  lara: 'bg-[#d1e1d3]',
  terminal: 'bg-[#cfecf7]',
  platform: 'bg-secondary',
}

/** LARA, then Terminal, then Platform last. */
export const COLUMN_GROUP_ORDER: ColumnGroup[] = ['lara', 'terminal', 'platform']

export const SEARCH_COLUMNS: SearchColumn[] = [
  // Platform — sync metadata + match state
  { id: 'laraSyncTime', label: 'LARA sync time', kind: 'datetime', source: 'platform' },
  { id: 'lastRefreshTime', label: 'Terminal sync time', kind: 'datetime', source: 'platform' },
  { id: 'mappingStatus', label: 'Mapping status', kind: 'text', source: 'platform' },
  { id: 'laraLink', label: 'LARA link', kind: 'text', source: 'platform' },
  { id: 'remark', label: 'Remark', kind: 'text', source: 'platform' },
  // LARA (Voyage first, voyage status last)
  { id: 'laraVoyage', label: 'Voyage', kind: 'text', source: 'lara' },
  { id: 'vesselName', label: 'Vessel name', kind: 'text', source: 'lara' },
  { id: 'pointCode', label: 'Point code', kind: 'text', source: 'lara' },
  { id: 'vesselType', label: 'Vessel type', kind: 'text', source: 'lara' },
  { id: 'brand', label: 'Brand', kind: 'text', source: 'lara' },
  { id: 'service', label: 'Service', kind: 'text', source: 'lara' },
  { id: 'laraPoolLocation', label: 'Pool location', kind: 'text', source: 'lara' },
  { id: 'laraEtb', label: 'ETB', kind: 'datetime', source: 'lara' },
  { id: 'laraEtd', label: 'ETD', kind: 'datetime', source: 'lara' },
  { id: 'voyageStatus', label: 'Voyage status', kind: 'text', source: 'lara' },
  // Terminal — mirror LARA semantic order; no field merges
  // Voyage → Vessel name (+ Ship) → Service/Line → Status → Pool/Terminal → times → extras
  { id: 'localVoyageExport', label: 'Export voyage', kind: 'text', source: 'terminal' },
  { id: 'localVoyageImport', label: 'Import voyage', kind: 'text', source: 'terminal' },
  { id: 'vesselNameEn', label: 'Vessel name EN', kind: 'text', source: 'terminal' },
  { id: 'vesselNameCn', label: 'Vessel name Cn', kind: 'text', source: 'terminal' },
  { id: 'shipCode', label: 'Ship code', kind: 'text', source: 'terminal' },
  { id: 'shipName', label: 'Ship name', kind: 'text', source: 'terminal' },
  { id: 'lineCode', label: 'Line code', kind: 'text', source: 'terminal' },
  { id: 'tmlVslStatus', label: 'Status', kind: 'text', source: 'terminal' },
  { id: 'terminal9code', label: 'Terminal', kind: 'text', source: 'terminal' },
  { id: 'terminalName', label: 'Terminal name', kind: 'text', source: 'terminal' },
  { id: 'tmlEta', label: 'ETA', kind: 'datetime', source: 'terminal' },
  { id: 'terminalEtb', label: 'ETB', kind: 'datetime', source: 'terminal' },
  { id: 'terminalEtd', label: 'ETD', kind: 'datetime', source: 'terminal' },
  { id: 'tmlAta', label: 'ATA', kind: 'datetime', source: 'terminal' },
  { id: 'terminalAtb', label: 'ATB', kind: 'datetime', source: 'terminal' },
  { id: 'terminalAtd', label: 'ATD', kind: 'datetime', source: 'terminal' },
  { id: 'vesselOperator', label: 'Vessel operator', kind: 'text', source: 'terminal' },
  { id: 'agentCode', label: 'Agent code', kind: 'text', source: 'terminal' },
  { id: 'agentName', label: 'Agent name', kind: 'text', source: 'terminal' },
  { id: 'cyOpen', label: 'CY open', kind: 'datetime', source: 'terminal' },
  { id: 'cyCutoff', label: 'CY closing', kind: 'datetime', source: 'terminal' },
  { id: 'portCloseDate', label: 'Port close date', kind: 'datetime', source: 'terminal' },
  { id: 'customsCloseDate', label: 'Customs close date', kind: 'datetime', source: 'terminal' },
  { id: 'portsEn', label: 'Ports EN', kind: 'text', source: 'terminal' },
  { id: 'portsCn', label: 'Ports CN', kind: 'text', source: 'terminal' },
  { id: 'terminalUpdateTime', label: 'Update time', kind: 'datetime', source: 'terminal' },
]

/** Columns that show an em dash when terminal data is missing or not confirmed. */
const TERMINAL_COLUMNS = new Set([
  'vesselOperator',
  'vesselNameCn',
  'localVoyageExport',
  'localVoyageImport',
  'vesselNameEn',
  'terminal9code',
  'terminalName',
  'shipCode',
  'shipName',
  'agentCode',
  'agentName',
  'lineCode',
  'portsEn',
  'portsCn',
  'tmlEta',
  'tmlAta',
  'terminalEtb',
  'terminalAtb',
  'terminalEtd',
  'terminalAtd',
  'cyOpen',
  'cyCutoff',
  'portCloseDate',
  'customsCloseDate',
  'terminalUpdateTime',
  'tmlVslStatus',
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

const FIELD_LABELS: Record<string, string> = {}
for (const [id, aliases] of Object.entries(NOT_FOUND_ALIASES)) {
  const label = SEARCH_COLUMNS.find((column) => column.id === id)?.label
  if (!label) continue
  FIELD_LABELS[id] = label
  for (const alias of aliases) FIELD_LABELS[alias] = label
}

export function historyFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? SEARCH_COLUMNS.find((column) => column.id === field)?.label ?? field
}

export function historyFieldMatches(field: string, columnId: string) {
  return field === columnId || (NOT_FOUND_ALIASES[columnId] ?? []).includes(field)
}

export const SEARCH_DEFAULT_SORT = [{ id: 'laraEtb', desc: true }]

function brandOf(v: VesselRecord): string {
  if (v.brand) return v.brand
  const name = v.vesselName.toUpperCase()
  if (name.startsWith('CMA CGM') || name.startsWith('CMA ')) return 'CMA'
  if (name.startsWith('ANL ')) return 'ANL'
  if (name.startsWith('APL ')) return 'APL'
  if (name.startsWith('CNC ')) return 'CNC'
  if (v.vesselOperator === 'CMA' || v.vesselOperator === 'CNC' || v.vesselOperator === 'ANL' || v.vesselOperator === 'APL') {
    return v.vesselOperator
  }
  return ''
}

function vesselTypeLabel(v: VesselRecord): string {
  if (v.groupKind === 'Partner Vessel') return 'Partner vsl'
  if (v.groupKind === '3PF') return '3PF'
  return 'Group vsl'
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

export function isMissingExternalVoyage(v: VesselRecord) {
  return v.matchingStatus === 'No external voyage'
}

/** Match found but not confirmed. Terminal cells show an em dash. */
export function isUnconfirmedMatch(v: VesselRecord) {
  return v.matchingStatus === 'Multiple terminal records' || v.matchingStatus === 'Terminal time gap'
}

export function candidateCountLabel(v: VesselRecord) {
  const count = v.terminalCandidates.length
  return count === 1 ? '1 candidate' : `${count} candidates`
}

export function manualOverrideFor(v: VesselRecord, columnId: string) {
  for (const field of OVERRIDE_FIELDS[columnId] ?? []) {
    const override = v.manualOverrides[field]
    if (override) return override
  }
  return undefined
}

export function brdTerminal(v: VesselRecord): { code: string; name: string } {
  const row = useTerminalCoverageStore().resolveTerminal(v.pointCode, v.terminalSchedule?.terminal)
  if (!row) return { code: '', name: '' }
  return {
    code: row.pool,
    name: row.nameZh || row.abbr || row.pool,
  }
}

/** Sortable raw value. Datetimes stay ISO; empty text sorts as ''. */
export function searchSortValue(v: VesselRecord, id: string): string | number {
  const terminal = brdTerminal(v)
  switch (id) {
    case 'vesselType':
      return vesselTypeLabel(v)
    case 'vesselOperator':
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
    case 'remark':
      return userRemarkText(v)
    case 'laraPoolLocation':
      return v.poolLocation || ''
    case 'terminal9code':
      if (isUnconfirmedMatch(v) && !v.terminalSchedule) return candidateCountLabel(v)
      return terminal.code || v.terminalSchedule?.terminal || ''
    case 'terminalName':
      if (isUnconfirmedMatch(v) && !v.terminalSchedule) return candidateCountLabel(v)
      return terminal.name
    case 'vesselNameEn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.vesselNameEn)
    case 'vesselNameCn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.vesselNameCn)
    case 'shipCode':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.shipCode ?? v.shipCode)
    case 'shipName':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.shipName)
    case 'agentCode':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.agentCode ?? v.agentCode)
    case 'agentName':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.agentName)
    case 'lineCode':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.lineCode)
    case 'portsEn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.portsEn)
    case 'portsCn':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.portsCn ?? v.portsOfCall)
    case 'laraEtb':
      return v.laraEtb || ''
    case 'laraEtd':
      return v.laraEtd || ''
    case 'tmlEta':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.eta)
    case 'tmlAta':
      return unconfirmedOrTerminal(v, v.terminalSchedule?.ata)
    case 'mappingStatus':
      return matchingStatusLabel(v.matchingStatus, v.sharedTerminal)
    case 'laraLink': {
      if (!v.laraLinkTargetId) return ''
      const target = useVesselStore().byId(v.laraLinkTargetId)
      return target ? laraLinkKey(target) : ''
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
  if (isUnconfirmedMatch(v) && TERMINAL_COLUMNS.has(id)) return '—'
  if (isNotFound(v, id)) return '—'
  const column = SEARCH_COLUMNS.find((col) => col.id === id)
  const raw = searchSortValue(v, id)
  if (column?.kind === 'datetime') return formatDateTime(String(raw))
  if (raw === '' || raw == null) return '—'
  return String(raw)
}

export function userRemarkText(v: VesselRecord): string {
  return v.remark || ''
}

/** User-facing match status. Stored values are the labels, except shared Auto matched. */
export function matchingStatusLabel(status: string, sharedTerminal = false): string {
  if (status === 'Auto matched' && sharedTerminal) return 'Multiple LARA records'
  return status
}

/** Cell values that should render with warning semantic color. */
export function isWarningCellText(text: string, _columnId?: string) {
  return text === 'Unconfirmed' || text === 'Not found' || text === 'Not Found'
}

export function columnHasHistory(v: VesselRecord, id: string) {
  return (v.scheduleLogs ?? []).some((log) => historyFieldMatches(log.field, id))
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
  return COLUMN_GROUP_ORDER.flatMap((group) => buckets[group])
}

function leafDef(column: SearchColumn): ColumnDef<any, any> {
  return {
    id: column.id,
    header: columnHeaderLabel(column),
    enableSorting: true,
    enableHiding: column.id !== 'vesselName',
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
