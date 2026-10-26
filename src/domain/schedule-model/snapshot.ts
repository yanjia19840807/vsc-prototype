import type { LaraSnapshot, TerminalSnapshot } from '@/domain/schedule-model/types'

export const LARA_FIELDS = [
  'laraVoyage',
  'pointCode',
  'laraPoolLocation',
  'multipleCallNumber',
  'vesselName',
  'vesselOperator',
  'brand',
  'service',
  'vesselType',
  'acPartner',
  'laraEta',
  'laraEtb',
  'laraEtd',
  'cutoff',
  'voyageStatus',
] as const

export const TERMINAL_FIELDS = [
  'vesselOperator',
  'exportVoyage',
  'importVoyage',
  'vesselNameCn',
  'terminalName',
  'eta',
  'ata',
  'etb',
  'atb',
  'etd',
  'atd',
  'cyOpen',
  'cyCutoff',
  'vesselStatus',
  'updateTime',
] as const

export type LaraField = (typeof LARA_FIELDS)[number]
export type TerminalField = (typeof TERMINAL_FIELDS)[number]

export const MATCH_FIELD = 'match'

export function emptyLaraSnapshot(): LaraSnapshot {
  return {
    laraVoyage: '',
    pointCode: '',
    laraPoolLocation: '',
    multipleCallNumber: '0',
    vesselName: '',
    vesselOperator: '',
    brand: '',
    service: '',
    vesselType: '',
    acPartner: '',
    laraEta: '',
    laraEtb: '',
    laraEtd: '',
    cutoff: '',
    voyageStatus: 'ACTIVE',
  }
}

export function emptyTerminalSnapshot(): TerminalSnapshot {
  return {
    vesselOperator: '',
    exportVoyage: '',
    importVoyage: '',
    vesselNameCn: '',
    terminalName: '',
    eta: '',
    ata: '',
    etb: '',
    atb: '',
    etd: '',
    atd: '',
    cyOpen: '',
    cyCutoff: '',
    vesselStatus: '',
    updateTime: '',
  }
}

export function laraValue(snapshot: LaraSnapshot | null | undefined, field: LaraField) {
  return snapshot?.[field] ?? ''
}

export function terminalValue(snapshot: TerminalSnapshot | null | undefined, field: TerminalField) {
  return snapshot?.[field] ?? ''
}

export function sameTerminal(left: TerminalSnapshot, right: TerminalSnapshot) {
  return TERMINAL_FIELDS.every((field) => left[field] === right[field])
}

export function pickLara(snapshot: LaraSnapshot): LaraSnapshot {
  return Object.fromEntries(LARA_FIELDS.map((field) => [field, snapshot[field] ?? ''])) as LaraSnapshot
}

export function pickTerminal(snapshot: TerminalSnapshot): TerminalSnapshot {
  return Object.fromEntries(TERMINAL_FIELDS.map((field) => [field, snapshot[field] ?? ''])) as TerminalSnapshot
}
