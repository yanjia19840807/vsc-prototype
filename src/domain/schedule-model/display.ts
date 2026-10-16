import { isLinkTarget } from '@/domain/schedule-model/state'
import type {
  LaraSyncRecord,
  ManualField,
  ScheduleState,
  TerminalCandidate,
  VesselCall,
} from '@/domain/schedule-model/types'

export const LARA_FIELDS = [
  'vesselName',
  'vesselNameCn',
  'brand',
  'service',
  'vesselType',
  'voyageStatus',
  'portCode',
  'eta',
  'etb',
  'etd',
] as const

export const TERMINAL_FIELDS = [
  'terminalName',
  'localVoyage',
  'importVoyage',
  'exportVoyage',
  'etb',
  'etd',
  'atb',
  'atd',
  'cyOpen',
  'cyCutoff',
] as const

export type LaraField = (typeof LARA_FIELDS)[number]
export type TerminalField = (typeof TERMINAL_FIELDS)[number]

export function manualField(fields: ManualField[] | undefined, field: string) {
  return fields?.find((item) => item.field === field)
}

export function laraRecordOf(state: ScheduleState, call: VesselCall) {
  if (!call.laraRecordId) return undefined
  return state.laraRecords.find((record) => record.id === call.laraRecordId)
}

export function manualLaraOf(state: ScheduleState, call: VesselCall) {
  if (!call.manualLaraId) return undefined
  return state.manualLaras.find((manual) => manual.id === call.manualLaraId)
}

export function manualTerminalOf(state: ScheduleState, call: VesselCall) {
  if (!call.manualTerminalId) return undefined
  return state.manualTerminals.find((manual) => manual.id === call.manualTerminalId)
}

export function bindingOf(state: ScheduleState, callId: string) {
  return state.bindings.find((binding) => binding.callId === callId)
}

export function candidateOf(state: ScheduleState, candidateId: string | null | undefined) {
  if (!candidateId) return undefined
  return state.terminalCandidates.find((candidate) => candidate.id === candidateId)
}

export function laraSourceValue(record: LaraSyncRecord | undefined, field: LaraField) {
  return record?.[field] ?? ''
}

export function terminalSourceValue(candidate: TerminalCandidate | undefined, field: TerminalField) {
  if (!candidate) return ''
  if (field === 'terminalName') return candidate.terminalName
  if (field === 'localVoyage') return ''
  return candidate[field] ?? ''
}

/** Display value for one LARA field. Manual value wins; otherwise the latest sync record. */
export function displayedLaraField(state: ScheduleState, call: VesselCall, field: LaraField) {
  const manual = manualField(manualLaraOf(state, call)?.fields, field)
  if (manual) return manual.manualValue
  return laraSourceValue(laraRecordOf(state, call), field)
}

/** Display value for one terminal field. Binding chooses the source, then manual overlay. */
export function displayedTerminalField(state: ScheduleState, call: VesselCall, field: TerminalField) {
  const manual = manualField(manualTerminalOf(state, call)?.fields, field)
  if (manual) return manual.manualValue
  const binding = bindingOf(state, call.id)
  if (!binding || binding.mode === 'MANUAL') return ''
  return terminalSourceValue(candidateOf(state, binding.candidateId), field)
}

export function assertEditable(state: ScheduleState, call: VesselCall) {
  if (isLinkTarget(state, call.id)) {
    throw new Error('A linked formal LARA call is left out of adjustments')
  }
}
