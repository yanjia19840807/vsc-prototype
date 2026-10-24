import type { ColumnDef, ColumnVisibilityState } from '@tanstack/vue-table'
import type { VesselRecord } from '@/types/vsp'

/**
 * Vessel Schedule List columns aligned to business Template (vsdv) + platform workflow fields.
 * `defaultOn` controls first-load / reset visibility; users can still toggle via Columns.
 */
export const SCHEDULE_COLUMN_META = [
  // BIZ template
  { id: 'department', label: 'Department', defaultOn: false },
  { id: 'pic', label: 'PIC', defaultOn: true },
  { id: 'vesselName', label: 'Vessel name', defaultOn: true },
  { id: 'vesselNameCn', label: 'Vessel name Cn', defaultOn: true },
  { id: 'laraVoyage', label: 'Voyage', defaultOn: true },
  { id: 'visitNo', label: 'Visit no', defaultOn: true },
  { id: 'localVoyage', label: 'Local voyage', defaultOn: true },
  { id: 'pointCode', label: 'Point code', defaultOn: true },
  // Terminal / Feituo template
  { id: 'lastRefreshTime', label: 'Terminal sync time', defaultOn: false },
  { id: 'externalExportVoyage', label: 'Export voyage', defaultOn: true },
  { id: 'externalImportVoyage', label: 'Import voyage', defaultOn: true },
  { id: 'externalVoyage', label: 'External voyage', defaultOn: false },
  { id: 'terminalScheduleStatus', label: 'TML schedule status', defaultOn: true },
  { id: 'terminalName', label: 'Name', defaultOn: true },
  { id: 'service', label: 'Service', defaultOn: true },
  { id: 'vesselOperator', label: 'Vessel operator', defaultOn: false },
  { id: 'acPartner', label: 'AC partner', defaultOn: false },
  { id: 'multipleCallNumber', label: 'Multiple call', defaultOn: false },
  { id: 'cutoff', label: 'Cutoff', defaultOn: false },
  { id: 'shipCode', label: 'Ship code', defaultOn: false },
  { id: 'agentCode', label: 'Agent code', defaultOn: false },
  { id: 'laraEta', label: 'ETA', defaultOn: true },
  { id: 'laraEtb', label: 'ETB', defaultOn: true },
  { id: 'laraEtd', label: 'ETD', defaultOn: true },
  { id: 'tmlEta', label: 'ETA', defaultOn: false },
  { id: 'tmlAta', label: 'ATA', defaultOn: false },
  { id: 'tmlEtb', label: 'ETB', defaultOn: true },
  { id: 'tmlAtb', label: 'ATB', defaultOn: false },
  { id: 'tmlEtd', label: 'ETD', defaultOn: true },
  { id: 'tmlAtd', label: 'ATD', defaultOn: true },
  { id: 'cyOpen', label: 'CY open', defaultOn: false },
  { id: 'cyCutoff', label: 'CY cut off', defaultOn: false },
  { id: 'portCloseDate', label: 'Port close', defaultOn: false },
  { id: 'customsCloseDate', label: 'Customs close', defaultOn: false },
  { id: 'portsOfCall', label: 'Ports of call', defaultOn: false },
  { id: 'laraPoolLocation', label: 'Pool location', defaultOn: false },
  // Platform / workflow
  { id: 'matchingStatus', label: 'Matching status', defaultOn: true },
  { id: 'workflowStatus', label: 'Workflow', defaultOn: true },
  { id: 'owner', label: 'Owner', defaultOn: true },
  { id: 'voyageStatus', label: 'Voyage status', defaultOn: false },
  { id: 'volumesLcDc', label: 'LC / DC', defaultOn: false },
  { id: 'deadline', label: 'Deadline alert', defaultOn: false },
] as const

export type ScheduleColId = (typeof SCHEDULE_COLUMN_META)[number]['id']

export function defaultColumnVisibility(): ColumnVisibilityState {
  const visibility: ColumnVisibilityState = {}
  for (const col of SCHEDULE_COLUMN_META) {
    visibility[col.id] = col.defaultOn
  }
  return visibility
}

export function rowDeadline(v: VesselRecord) {
  const deadlines = v.tasks.map((t) => t.deadline).filter(Boolean) as string[]
  if (!deadlines.length) return undefined
  return [...deadlines].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
}

function textCol(id: ScheduleColId, header: string): ColumnDef<any, any> {
  return { accessorKey: id, id, header, enableSorting: true }
}

function dtCol(id: ScheduleColId, header: string): ColumnDef<any, any> {
  return { accessorKey: id, id, header, enableSorting: true, sortFn: 'datetime' }
}

/** Stable column defs for TanStack Table (headers via DataTableColumnHeader; cells in template). */
export const scheduleColumns: ColumnDef<any, any>[] = [
  {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    header: () => null,
  },
  textCol('department', 'Department'),
  textCol('pic', 'PIC'),
  textCol('vesselName', 'Vessel name'),
  {
    id: 'vesselNameCn',
    header: 'Vessel name Cn',
    enableSorting: true,
    accessorFn: (row: VesselRecord) => row.terminalSchedule?.vesselNameCn || '',
  },
  textCol('laraVoyage', 'Voyage'),
  textCol('visitNo', 'Visit no'),
  textCol('localVoyage', 'Local voyage'),
  textCol('pointCode', 'Point code'),
  textCol('lastRefreshTime', 'Terminal sync time'),
  textCol('externalExportVoyage', 'Export voyage'),
  textCol('externalImportVoyage', 'Import voyage'),
  textCol('externalVoyage', 'External voyage'),
  textCol('terminalScheduleStatus', 'TML schedule status'),
  textCol('terminalName', 'Name'),
  textCol('service', 'Service'),
  textCol('vesselOperator', 'Vessel operator'),
  textCol('acPartner', 'AC partner'),
  textCol('multipleCallNumber', 'Multiple call'),
  dtCol('cutoff', 'Cutoff'),
  textCol('shipCode', 'Ship code'),
  textCol('agentCode', 'Agent code'),
  dtCol('laraEta', 'ETA'),
  dtCol('laraEtb', 'ETB'),
  dtCol('laraEtd', 'ETD'),
  dtCol('tmlEta', 'ETA'),
  dtCol('tmlAta', 'ATA'),
  dtCol('tmlEtb', 'ETB'),
  dtCol('tmlAtb', 'ATB'),
  dtCol('tmlEtd', 'ETD'),
  dtCol('tmlAtd', 'ATD'),
  dtCol('cyOpen', 'CY open'),
  dtCol('cyCutoff', 'CY cut off'),
  dtCol('portCloseDate', 'Port close'),
  dtCol('customsCloseDate', 'Customs close'),
  textCol('portsOfCall', 'Ports of call'),
  textCol('laraPoolLocation', 'Pool location'),
  textCol('matchingStatus', 'Matching status'),
  textCol('workflowStatus', 'Workflow'),
  {
    id: 'owner',
    header: 'Owner',
    enableSorting: true,
    accessorFn: (row) => row.owner || '',
  },
  textCol('voyageStatus', 'Voyage status'),
  {
    id: 'volumesLcDc',
    header: 'LC / DC',
    enableSorting: true,
    accessorFn: (row: VesselRecord) => `${row.volumes.lc} / ${row.volumes.dc}`,
  },
  {
    id: 'deadline',
    header: 'Deadline alert',
    enableSorting: true,
    accessorFn: (row) => rowDeadline(row) || '',
    sortFn: 'datetime',
  },
  {
    id: 'actions',
    header: 'Actions',
    enableSorting: false,
    enableHiding: false,
  },
]
