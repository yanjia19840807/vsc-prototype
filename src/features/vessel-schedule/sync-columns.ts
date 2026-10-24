import { MATCH_FIELD, type LaraField, type TerminalField } from '@/domain/schedule-model/snapshot'
import type { FieldReview } from '@/domain/schedule-model/sync-diff'
import { SEARCH_COLUMNS, groupColumnOrder } from '@/features/vessel-search/search-columns'

export type SyncColumnBinding =
  | { side: 'LARA'; field: LaraField }
  | { side: 'TERMINAL'; field: TerminalField }
  | { side: 'MATCH'; field: typeof MATCH_FIELD }

export const SYNC_COLUMNS: Record<string, SyncColumnBinding> = {
  laraVoyage: { side: 'LARA', field: 'laraVoyage' },
  visitNo: { side: 'LARA', field: 'visitNo' },
  pointCode: { side: 'LARA', field: 'pointCode' },
  laraPoolLocation: { side: 'LARA', field: 'laraPoolLocation' },
  multipleCallNumber: { side: 'LARA', field: 'multipleCallNumber' },
  vesselName: { side: 'LARA', field: 'vesselName' },
  vesselOperator: { side: 'LARA', field: 'vesselOperator' },
  brand: { side: 'LARA', field: 'brand' },
  service: { side: 'LARA', field: 'service' },
  acPartner: { side: 'LARA', field: 'acPartner' },
  laraEta: { side: 'LARA', field: 'laraEta' },
  laraEtb: { side: 'LARA', field: 'laraEtb' },
  laraEtd: { side: 'LARA', field: 'laraEtd' },
  cutoff: { side: 'LARA', field: 'cutoff' },
  voyageStatus: { side: 'LARA', field: 'voyageStatus' },
  vesselType: { side: 'LARA', field: 'vesselType' },
  localVoyageImport: { side: 'TERMINAL', field: 'importVoyage' },
  localVoyageExport: { side: 'TERMINAL', field: 'exportVoyage' },
  terminal9code: { side: 'TERMINAL', field: 'terminalCode' },
  terminalName: { side: 'TERMINAL', field: 'terminalName' },
  tmlVslStatus: { side: 'TERMINAL', field: 'vesselStatus' },
  tmlEta: { side: 'TERMINAL', field: 'eta' },
  terminalEtb: { side: 'TERMINAL', field: 'etb' },
  terminalEtd: { side: 'TERMINAL', field: 'etd' },
  terminalAtb: { side: 'TERMINAL', field: 'atb' },
  terminalAtd: { side: 'TERMINAL', field: 'atd' },
  cyOpen: { side: 'TERMINAL', field: 'cyOpen' },
  cyCutoff: { side: 'TERMINAL', field: 'cyCutoff' },
  mappingStatus: { side: 'MATCH', field: MATCH_FIELD },
}

export function bindingFor(columnId: string) {
  return SYNC_COLUMNS[columnId]
}

export function reviewForColumn(fields: FieldReview[], columnId: string) {
  const binding = SYNC_COLUMNS[columnId]
  if (!binding) return undefined
  return fields.find((field) => field.side === binding.side && field.field === binding.field)
}

export function columnIdForReview(field: FieldReview) {
  return Object.entries(SYNC_COLUMNS).find(([, binding]) => binding.side === field.side && binding.field === field.field)?.[0] ?? field.field
}

/** List columns only, in LARA → Terminal → Platform order. */
export function watchedColumnIds() {
  return groupColumnOrder(SEARCH_COLUMNS.map((column) => column.id))
}
