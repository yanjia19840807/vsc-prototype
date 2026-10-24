import { CURRENT_USER } from '@/mock/ports'
import {
  applyLaraPayload,
  applyTerminalPayload,
  editTerminalFields,
} from '@/domain/schedule-model/sync-diff'
import { emptyScheduleState, nextId } from '@/domain/schedule-model/state'
import type {
  LaraSnapshot,
  ScheduleState,
  TerminalQuery,
  TerminalSnapshot,
  VesselCall,
} from '@/domain/schedule-model/types'
import { brandFromVoyage } from '@/domain/lara-brand'
import type { TerminalSchedule, VesselRecord } from '@/types/vsp'

const T0 = '2026-10-20T08:00:00.000Z'
const T1 = '2026-10-21T08:00:00.000Z'
const T2 = '2026-10-22T08:00:00.000Z'
const LARA_SHIFT = new Set(['v7', 'v8', 'v27'])
const TERMINAL_SHIFT = new Set(['v8'])

export type ScheduleDisplayPatch = {
  id: string
  fields: Partial<Pick<VesselRecord, 'laraEtb' | 'tmlEtb'>>
}

export function seedSchedule(vessels: VesselRecord[]) {
  let state = emptyScheduleState()
  const patches: ScheduleDisplayPatch[] = []
  for (const vessel of vessels) {
    if (vessel.id === 'v6') state = seedHeldVoyage(state, vessel)
    else if (vessel.id === 'v26') state = seedManyAfterMatch(state, vessel)
    else if (vessel.id === 'v29') state = seedNoneAfterMatch(state, vessel)
    else state = seedAuto(state, vessel, patches)
  }
  return { state, patches }
}

function seedAuto(state: ScheduleState, vessel: VesselRecord, patches: ScheduleDisplayPatch[]) {
  let next = addCall(state, vessel)
  const lara = laraFrom(vessel)
  next = adoptLara(next, vessel.id, lara, T0)
  if (hasTerminal(vessel)) next = adoptTerminal(next, vessel.id, terminalFrom(vessel), T0, true)
  if (LARA_SHIFT.has(vessel.id) && lara.laraEtb) {
    const etb = shiftIso(lara.laraEtb, 1)
    next = adoptLara(next, vessel.id, { ...lara, laraEtb: etb }, T2)
    patches.push({ id: vessel.id, fields: { laraEtb: etb } })
  }
  if (TERMINAL_SHIFT.has(vessel.id) && hasTerminal(vessel)) {
    const terminal = terminalFrom(vessel)
    if (terminal.etb) {
      const etb = shiftIso(terminal.etb, 1)
      next = adoptTerminal(next, vessel.id, { ...terminal, etb }, T2, true)
      const existing = patches.find((patch) => patch.id === vessel.id)
      if (existing) existing.fields.tmlEtb = etb
      else patches.push({ id: vessel.id, fields: { tmlEtb: etb } })
    }
  }
  return next
}

function seedHeldVoyage(state: ScheduleState, vessel: VesselRecord) {
  let next = addCall(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  const source = vessel.manualOverrides.evoyage?.source || vessel.manualOverrides.externalVoyage?.source
  if (!source) return adoptTerminal(next, vessel.id, current, T0, true)
  next = adoptTerminal(next, vessel.id, { ...current, exportVoyage: source }, T0, true)
  next = editTerminalFields(next, {
    callId: vessel.id,
    fields: { exportVoyage: current.exportVoyage },
    reason: vessel.manualOverrides.evoyage?.reason || 'Terminal confirmed',
    updatedBy: vessel.manualOverrides.evoyage?.by || CURRENT_USER,
    updatedAt: T1,
  })
  return adoptTerminal(next, vessel.id, { ...current, exportVoyage: `${current.exportVoyage}-S` }, T2, false)
}

function seedManyAfterMatch(state: ScheduleState, vessel: VesselRecord) {
  let next = addCall(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  const edited = vessel.manualOverrides.tmlEtd?.source || vessel.manualOverrides.etd?.source
  next = adoptTerminal(next, vessel.id, edited ? { ...current, etd: edited } : current, T0, true)
  if (edited) {
    next = editTerminalFields(next, {
      callId: vessel.id,
      fields: { etd: current.etd },
      reason: vessel.manualOverrides.tmlEtd?.reason || 'Agent update',
      updatedBy: CURRENT_USER,
      updatedAt: T1,
    })
  }
  const candidates = vessel.terminalCandidates.length ? vessel.terminalCandidates : []
  if (candidates.length < 2) return next
  return storePayloads(next, vessel.id, candidates.map((schedule) => snapshotFromCandidate(vessel, schedule)), T2)
}

function seedNoneAfterMatch(state: ScheduleState, vessel: VesselRecord) {
  let next = addCall(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  if (hasTerminal(vessel)) next = adoptTerminal(next, vessel.id, terminalFrom(vessel), T0, true)
  return recordNotFound(next, vessel.id, T2)
}

function addCall(state: ScheduleState, vessel: VesselRecord) {
  const call: VesselCall = {
    id: vessel.id,
    createdFrom: vessel.recordStatus === 'Inactive' ? 'MANUAL' : 'LARA',
    laraVoyage: vessel.laraVoyage,
    pointCode: vessel.pointCode,
    visitNo: vessel.visitNo,
    laraPoolLocation: vessel.laraPoolLocation,
    platformOmit: false,
    laraVersionId: null,
    matchId: null,
  }
  return { ...state, calls: [...state.calls, call] }
}

function adoptLara(state: ScheduleState, callId: string, snapshot: LaraSnapshot, at: string, apply = true) {
  const issued = nextId(state, 'lara-payload')
  const payload = { ...snapshot, id: issued.id, runId: 'seed-lara', callId, capturedAt: at }
  const next = { ...issued.state, laraPayloads: [...issued.state.laraPayloads, payload] }
  if (!apply) return next
  return applyLaraPayload(next, { callId, payloadId: payload.id, updatedBy: 'System', updatedAt: at })
}

function adoptTerminal(state: ScheduleState, callId: string, snapshot: TerminalSnapshot, at: string, apply: boolean) {
  const call = state.calls.find((item) => item.id === callId)
  const queryIssued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: queryIssued.id,
    syncRunId: 'seed-terminal',
    callId,
    laraVersionId: call?.laraVersionId ?? '',
    trigger: 'SCHEDULE',
    requestedAt: at,
    requestedBy: 'System',
    externalVoyage: snapshot.exportVoyage,
    status: 'FOUND',
    respondedAt: at,
    failureReason: '',
  }
  let next = { ...queryIssued.state, terminalQueries: [...queryIssued.state.terminalQueries, query] }
  const payloadIssued = nextId(next, 'terminal-payload')
  const payload = { ...snapshot, id: payloadIssued.id, queryId: query.id, callId }
  next = { ...payloadIssued.state, terminalPayloads: [...payloadIssued.state.terminalPayloads, payload] }
  if (!apply) return next
  return applyTerminalPayload(next, { callId, payloadId: payload.id, updatedBy: 'System', updatedAt: at })
}

function storePayloads(state: ScheduleState, callId: string, snapshots: TerminalSnapshot[], at: string) {
  const call = state.calls.find((item) => item.id === callId)
  const queryIssued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: queryIssued.id,
    syncRunId: 'seed-terminal',
    callId,
    laraVersionId: call?.laraVersionId ?? '',
    trigger: 'SCHEDULE',
    requestedAt: at,
    requestedBy: 'System',
    externalVoyage: snapshots.map((item) => item.exportVoyage).filter(Boolean).join(' / '),
    status: 'FOUND',
    respondedAt: at,
    failureReason: '',
  }
  let next = { ...queryIssued.state, terminalQueries: [...queryIssued.state.terminalQueries, query] }
  for (const snapshot of snapshots) {
    const payloadIssued = nextId(next, 'terminal-payload')
    const payload = { ...snapshot, id: payloadIssued.id, queryId: query.id, callId }
    next = { ...payloadIssued.state, terminalPayloads: [...payloadIssued.state.terminalPayloads, payload] }
  }
  return next
}

function recordNotFound(state: ScheduleState, callId: string, at: string) {
  const call = state.calls.find((item) => item.id === callId)
  const issued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: issued.id,
    syncRunId: 'seed-terminal',
    callId,
    laraVersionId: call?.laraVersionId ?? '',
    trigger: 'SCHEDULE',
    requestedAt: at,
    requestedBy: 'System',
    externalVoyage: '',
    status: 'NOT_FOUND',
    respondedAt: at,
    failureReason: '',
  }
  return { ...issued.state, terminalQueries: [...issued.state.terminalQueries, query] }
}

function snapshotFromCandidate(vessel: VesselRecord, schedule: TerminalSchedule): TerminalSnapshot {
  const base = terminalFrom(vessel)
  return {
    ...base,
    importVoyage: schedule.ivoyage || base.importVoyage,
    exportVoyage: schedule.evoyage || base.exportVoyage,
    localVoyage: schedule.evoyage || base.localVoyage,
    terminalCode: schedule.terminal || base.terminalCode,
    vesselStatus: schedule.status || base.vesselStatus,
    eta: schedule.eta ?? '',
    etb: schedule.etb ?? '',
    etd: schedule.etd ?? '',
    atb: schedule.atb ?? '',
    atd: schedule.atd ?? '',
    cyOpen: schedule.cyOpen ?? '',
    cyCutoff: schedule.cyClosing ?? '',
  }
}

function hasTerminal(vessel: VesselRecord) {
  return vessel.matchingStatus !== 'No terminal record'
    && Boolean(vessel.terminalName || vessel.externalVoyage || vessel.tmlEtb)
}

function laraFrom(vessel: VesselRecord): LaraSnapshot {
  return {
    laraVoyage: vessel.laraVoyage,
    pointCode: vessel.pointCode,
    visitNo: vessel.visitNo,
    laraPoolLocation: vessel.laraPoolLocation,
    multipleCallNumber: vessel.multipleCallNumber,
    vesselName: vessel.vesselName,
    vesselOperator: vessel.vesselOperator,
    brand: brandFromVoyage(vessel.laraVoyage) || vessel.brand || '',
    service: vessel.service,
    vesselType: vessel.vesselType,
    acPartner: vessel.acPartner,
    laraEta: vessel.laraEta,
    laraEtb: vessel.laraEtb,
    laraEtd: vessel.laraEtd,
    cutoff: vessel.cutoff,
    voyageStatus: vessel.voyageStatus === 'Omit' ? 'OMIT' : 'ACTIVE',
  }
}

function terminalFrom(vessel: VesselRecord): TerminalSnapshot {
  return {
    importVoyage: vessel.externalImportVoyage,
    exportVoyage: vessel.externalExportVoyage || vessel.externalVoyage,
    localVoyage: vessel.localVoyage,
    terminalCode: vessel.terminalSchedule?.terminal ?? '',
    terminalName: vessel.terminalName,
    vesselStatus: vessel.terminalScheduleStatus,
    eta: vessel.tmlEta,
    etb: vessel.tmlEtb,
    etd: vessel.tmlEtd,
    atb: vessel.tmlAtb,
    atd: vessel.tmlAtd,
    cyOpen: vessel.cyOpen,
    cyCutoff: vessel.cyCutoff,
  }
}

function shiftIso(value: string, days: number) {
  const time = Date.parse(value)
  if (!value || Number.isNaN(time)) return value
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString()
}
