import { MATCH_FIELD, type LaraField, type TerminalField } from '@/domain/schedule-model/snapshot'
import type { FieldReview } from '@/domain/schedule-model/sync-diff'
import { SEARCH_COLUMNS, groupColumnOrder } from '@/features/vessel-search/search-columns'

export type SyncColumnBinding =
  | { side: 'LARA'; field: LaraField }
  | { side: 'TERMINAL'; field: TerminalField }
  | { side: 'MATCH'; field: typeof MATCH_FIELD }

export const SYNC_COLUMNS: Record<string, SyncColumnBinding> = {
  laraVoyage: { side: 'LARA', field: 'laraVoyage' },
  pointCode: { side: 'LARA', field: 'pointCode' },
  laraPoolLocation: { side: 'LARA', field: 'laraPoolLocation' },
  multipleCallNumber: { side: 'LARA', field: 'multipleCallNumber' },
  vesselName: { side: 'LARA', field: 'vesselName' },
  brand: { side: 'LARA', field: 'brand' },
  service: { side: 'LARA', field: 'service' },
  acPartner: { side: 'LARA', field: 'acPartner' },
  laraEta: { side: 'LARA', field: 'laraEta' },
  laraEtb: { side: 'LARA', field: 'laraEtb' },
  laraEtd: { side: 'LARA', field: 'laraEtd' },
  cutoff: { side: 'LARA', field: 'cutoff' },
  voyageStatus: { side: 'LARA', field: 'voyageStatus' },
  vesselType: { side: 'LARA', field: 'vesselType' },
  vesselOperator: { side: 'TERMINAL', field: 'vesselOperator' },
  localVoyageExport: { side: 'TERMINAL', field: 'exportVoyage' },
  localVoyageImport: { side: 'TERMINAL', field: 'importVoyage' },
  vesselNameCn: { side: 'TERMINAL', field: 'vesselNameCn' },
  terminalName: { side: 'TERMINAL', field: 'terminalName' },
  tmlEta: { side: 'TERMINAL', field: 'eta' },
  tmlAta: { side: 'TERMINAL', field: 'ata' },
  terminalEtb: { side: 'TERMINAL', field: 'etb' },
  terminalAtb: { side: 'TERMINAL', field: 'atb' },
  terminalEtd: { side: 'TERMINAL', field: 'etd' },
  terminalAtd: { side: 'TERMINAL', field: 'atd' },
  cyOpen: { side: 'TERMINAL', field: 'cyOpen' },
  cyCutoff: { side: 'TERMINAL', field: 'cyCutoff' },
  tmlVslStatus: { side: 'TERMINAL', field: 'vesselStatus' },
  terminalUpdateTime: { side: 'TERMINAL', field: 'updateTime' },
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
