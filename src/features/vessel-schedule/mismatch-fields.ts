import {
  SEARCH_COLUMNS,
  isMissingExternalVoyage,
  type SearchColumn,
} from '@/features/vessel-search/search-columns'
import { formatDateTime } from '@/lib/vessel-utils'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import type { TerminalSchedule, VesselRecord } from '@/types/vsp'

/** Map search column ids to TerminalSchedule keys (and vesselOperator). */
export type TerminalDraftKey =
  | keyof TerminalSchedule
  | 'vesselOperator'

export type TerminalDraft = Record<TerminalDraftKey, string>

export const LARA_COLUMNS = SEARCH_COLUMNS.filter((column) => column.source === 'lara')

/** Terminal fields written by a sync. Order matches the terminal record. */
export const TERMINAL_SYNC_COLUMN_IDS = [
  'vesselOperator',
  'localVoyageExport',
  'localVoyageImport',
  'vesselNameCn',
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
] as const

/** Columns shown when choosing among terminal sync records. */
export const CANDIDATE_COLUMN_DEFS: Array<{
  id: keyof TerminalSchedule
  label: string
  kind: 'text' | 'datetime'
}> = [
  { id: 'evoyage', label: 'Export voyage', kind: 'text' },
  { id: 'ivoyage', label: 'Import voyage', kind: 'text' },
  { id: 'vesselNameCn', label: 'Vessel name Cn', kind: 'text' },
  { id: 'terminal', label: 'Terminal name', kind: 'text' },
  { id: 'eta', label: 'ETA', kind: 'datetime' },
  { id: 'ata', label: 'ATA', kind: 'datetime' },
  { id: 'etb', label: 'ETB', kind: 'datetime' },
  { id: 'atb', label: 'ATB', kind: 'datetime' },
  { id: 'etd', label: 'ETD', kind: 'datetime' },
  { id: 'atd', label: 'ATD', kind: 'datetime' },
  { id: 'cyOpen', label: 'CY open', kind: 'datetime' },
  { id: 'cyClosing', label: 'CY closing', kind: 'datetime' },
  { id: 'status', label: 'Status', kind: 'text' },
  { id: 'updateTime', label: 'Update time', kind: 'datetime' },
]

const COLUMN_TO_DRAFT: Partial<Record<string, TerminalDraftKey>> = {
  localVoyageExport: 'evoyage',
  localVoyageImport: 'ivoyage',
  vesselNameEn: 'vesselNameEn',
  vesselNameCn: 'vesselNameCn',
  shipCode: 'shipCode',
  shipName: 'shipName',
  lineCode: 'lineCode',
  tmlVslStatus: 'status',
  terminal9code: 'terminal',
  terminalName: 'terminal',
  tmlEta: 'eta',
  tmlAta: 'ata',
  terminalEtb: 'etb',
  terminalAtb: 'atb',
  terminalEtd: 'etd',
  terminalAtd: 'atd',
  vesselOperator: 'vesselOperator',
  agentCode: 'agentCode',
  agentName: 'agentName',
  cyOpen: 'cyOpen',
  cyCutoff: 'cyClosing',
  portCloseDate: 'portCloseDate',
  customsCloseDate: 'customsCloseDate',
  portsEn: 'portsEn',
  portsCn: 'portsCn',
  terminalUpdateTime: 'updateTime',
}

/** Panel fields: the terminal values a sync writes, in record order. */
export function terminalPanelColumns(): SearchColumn[] {
  return TERMINAL_SYNC_COLUMN_IDS.map((id) => {
    const column = SEARCH_COLUMNS.find((item) => item.id === id)
    if (!column) throw new Error(`Missing terminal column ${id}`)
    return column
  })
}

export function draftKeyForColumn(columnId: string): TerminalDraftKey | undefined {
  return COLUMN_TO_DRAFT[columnId]
}

export function emptyTerminalDraft(): TerminalDraft {
  return {
    status: '',
    vesselNameEn: '',
    vesselNameCn: '',
    shipCode: '',
    shipName: '',
    agentCode: '',
    agentName: '',
    lineCode: '',
    terminal: '',
    portsEn: '',
    portsCn: '',
    eta: '',
    ata: '',
    etb: '',
    atb: '',
    etd: '',
    atd: '',
    cyOpen: '',
    cyClosing: '',
    portCloseDate: '',
    customsCloseDate: '',
    updateTime: '',
    ivoyage: '',
    evoyage: '',
    vesselOperator: '',
  }
}

export function scheduleToDraft(
  schedule: TerminalSchedule | null | undefined,
  vessel?: VesselRecord | null,
): TerminalDraft {
  const draft = emptyTerminalDraft()
  if (schedule) {
    for (const key of Object.keys(draft) as TerminalDraftKey[]) {
      if (key === 'vesselOperator') continue
      const value = schedule[key as keyof TerminalSchedule]
      draft[key] = value ?? ''
    }
  }
  draft.vesselOperator = vessel?.vesselOperator ?? ''
  if (!draft.terminal && vessel) {
    const row = useTerminalCoverageStore().resolveTerminal(vessel.pointCode, schedule?.terminal)
    if (row?.abbr) draft.terminal = row.abbr
  }
  return draft
}

export function draftToSchedule(draft: TerminalDraft, base?: TerminalSchedule | null): TerminalSchedule {
  return {
    status: draft.status || null,
    vesselNameEn: draft.vesselNameEn || null,
    vesselNameCn: draft.vesselNameCn || null,
    shipCode: draft.shipCode || null,
    shipName: draft.shipName || null,
    agentCode: draft.agentCode || null,
    agentName: draft.agentName || null,
    lineCode: draft.lineCode || null,
    terminal: draft.terminal || null,
    portsEn: draft.portsEn || null,
    portsCn: draft.portsCn || null,
    eta: draft.eta || null,
    ata: draft.ata || null,
    etb: draft.etb || null,
    atb: draft.atb || null,
    etd: draft.etd || null,
    atd: draft.atd || null,
    cyOpen: draft.cyOpen || null,
    cyClosing: draft.cyClosing || null,
    portCloseDate: draft.portCloseDate || null,
    customsCloseDate: draft.customsCloseDate || null,
    updateTime: draft.updateTime || null,
    ivoyage: draft.ivoyage || null,
    evoyage: draft.evoyage || null,
  }
}

export function displayDraftValue(draft: TerminalDraft, key: TerminalDraftKey, kind: 'text' | 'datetime') {
  const raw = draft[key]
  if (!raw) return '—'
  if (kind === 'datetime') return formatDateTime(raw)
  return raw
}

export function datetimeInputValue(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function datetimeToIso(local: string) {
  if (!local) return ''
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? local : date.toISOString()
}

/** Highlight ETD when the LARA–terminal ETD gap exceeds 3 days. */
export function reviewWarnKeys(vessel: VesselRecord, schedule: TerminalSchedule | null | undefined): Set<TerminalDraftKey> {
  if (isMissingExternalVoyage(vessel)) return new Set<TerminalDraftKey>(['evoyage', 'ivoyage'])
  const warn = new Set<TerminalDraftKey>()
  if (!schedule) {
    warn.add('etd')
    return warn
  }
  const dayMs = 24 * 60 * 60 * 1000
  const gapDays = (lara: string, tml: string | null) => {
    if (!lara || !tml) return null
    const a = new Date(lara).getTime()
    const b = new Date(tml).getTime()
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return Math.abs(a - b) / dayMs
  }
  const etdGap = gapDays(vessel.laraEtd, schedule.etd)
  if (etdGap == null || etdGap > 3) warn.add('etd')
  return warn
}

export function reviewAlertText(vessel: VesselRecord, schedule: TerminalSchedule | null | undefined) {
  if (isMissingExternalVoyage(vessel)) {
    return 'A terminal schedule was found, but export/import voyage is missing. Enter the voyage to continue.'
  }
  const warn = reviewWarnKeys(vessel, schedule)
  const parts: string[] = []
  const dayMs = 24 * 60 * 60 * 1000
  if (warn.has('etd') && schedule?.etd && vessel.laraEtd) {
    const days = Math.round(Math.abs(new Date(vessel.laraEtd).getTime() - new Date(schedule.etd).getTime()) / dayMs)
    if (Number.isFinite(days)) parts.push(`ETD gap is about ${days} day(s)`)
  }
  const base = MISMATCH_ALERT_REVIEW
  return parts.length ? `${base} ${parts.join('; ')}.` : base
}

const MISMATCH_ALERT_REVIEW =
  'The LARA ETD and terminal ETD differ by more than 3 days. Review and confirm or edit terminal data.'
