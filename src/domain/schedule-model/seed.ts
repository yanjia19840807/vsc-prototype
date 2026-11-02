import { CURRENT_USER } from '@/mock/ports'
import {
  applyLaraPayload,
  applyTerminalPayload,
  editTerminalFields,
  refreshListProjection,
  settleOpenShape,
} from '@/domain/schedule-model/sync-diff'
import { emptyScheduleState, nextId } from '@/domain/schedule-model/state'
import {
  emptyListColumns,
  type LaraSnapshot,
  type ScheduleState,
  type TerminalQuery,
  type TerminalSnapshot,
  type VesselSchedule,
} from '@/domain/schedule-model/types'
import { brandFromVoyage } from '@/domain/lara-brand'
import type { TerminalSchedule, VesselRecord } from '@/types/vsc'

const T0 = '2026-10-20T08:00:00.000Z'
const T1 = '2026-10-21T08:00:00.000Z'
const T2 = '2026-10-22T08:00:00.000Z'
const LARA_SHIFT = new Set(['v7'])

export type ScheduleDisplayPatch = {
  id: string
  fields: Partial<Pick<VesselRecord, 'laraEtb' | 'tmlEtb' | 'tmlEta'>>
}

type ScenarioSeed = (state: ScheduleState, vessel: VesselRecord, patches: ScheduleDisplayPatch[]) => ScheduleState

const scenarioSeeders: Record<string, ScenarioSeed> = {
  v4: (state, vessel) => seedFirstNone(state, vessel),
  v5: (state, vessel) => seedOpenMany(state, vessel),
  v6: (state, vessel) => seedHeldVoyage(state, vessel),
  v37: (state, vessel) => seedUnwatchedEta(state, vessel),
  v47: (state, vessel) => seedVoyageTwinAfterManual(state, vessel),
  v48: (state, vessel, patches) => seedGapAfterManual(state, vessel, patches),
  v50: (state, vessel) => seedMissingVoyageAfterManual(state, vessel),
  v51: (state, vessel) => seedManyUnmatchedAfterManual(state, vessel),
}

export function seedSchedule(vessels: VesselRecord[]) {
  let state = emptyScheduleState()
  const patches: ScheduleDisplayPatch[] = []
  for (const vessel of vessels) {
    const seed = scenarioSeeders[vessel.id]
    state = seed ? seed(state, vessel, patches) : seedAuto(state, vessel, patches)
  }
  for (const schedule of state.schedules) state = refreshListProjection(state, schedule.id)
  return { state, patches }
}

function seedAuto(state: ScheduleState, vessel: VesselRecord, patches: ScheduleDisplayPatch[]) {
  let next = addSchedule(state, vessel)
  const lara = laraFrom(vessel)
  next = adoptLara(next, vessel.id, lara, T0)
  if (hasTerminal(vessel)) next = adoptTerminal(next, vessel.id, terminalFrom(vessel), T0, true)
  if (LARA_SHIFT.has(vessel.id) && lara.laraEtb) {
    const etb = shiftIso(lara.laraEtb, 1)
    next = adoptLara(next, vessel.id, { ...lara, laraEtb: etb }, T2)
    patches.push({ id: vessel.id, fields: { laraEtb: etb } })
  }
  return next
}

function seedHeldVoyage(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  const source = vessel.manualOverrides.evoyage?.source || vessel.manualOverrides.externalVoyage?.source
  if (!source) return adoptTerminal(next, vessel.id, current, T0, true)
  next = adoptTerminal(next, vessel.id, { ...current, exportVoyage: source }, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { exportVoyage: current.exportVoyage },
    reason: vessel.manualOverrides.evoyage?.reason || 'Terminal confirmed',
    updatedBy: vessel.manualOverrides.evoyage?.by || CURRENT_USER,
    updatedAt: T1,
  })
  return adoptTerminal(next, vessel.id, { ...current, exportVoyage: `${current.exportVoyage}-S` }, T2, true)
}

function seedVoyageTwinAfterManual(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, current, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { etd: current.etd },
    reason: 'Selected terminal',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  const matched = {
    ...current,
    etb: shiftIso(current.etb, 2),
    etd: shiftIso(current.etd, 2),
  }
  const other = {
    ...current,
    exportVoyage: `${current.exportVoyage}-W`,
    importVoyage: `${current.importVoyage}X`,
  }
  return storePayloads(next, vessel.id, [matched, other], T2)
}

function seedManyUnmatchedAfterManual(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, current, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { etd: current.etd },
    reason: 'Selected terminal',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  const first = {
    ...current,
    exportVoyage: `${current.exportVoyage}-A`,
    importVoyage: `${current.importVoyage}A`,
  }
  const second = {
    ...current,
    exportVoyage: `${current.exportVoyage}-B`,
    importVoyage: `${current.importVoyage}B`,
  }
  return storePayloads(next, vessel.id, [first, second], T2)
}

function seedGapAfterManual(state: ScheduleState, vessel: VesselRecord, patches: ScheduleDisplayPatch[]) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, current, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { etd: current.etd },
    reason: 'Selected terminal',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  const eta = shiftIso(current.eta, 5)
  patches.push({ id: vessel.id, fields: { tmlEta: eta } })
  return adoptTerminal(next, vessel.id, { ...current, eta }, T2, true)
}

function seedUnwatchedEta(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  const current = laraFrom(vessel)
  next = adoptLara(next, vessel.id, { ...current, laraEta: shiftIso(current.laraEta, -1) }, T0)
  next = adoptLara(next, vessel.id, current, T2)
  return bindTerminal(next, vessel)
}

function seedFirstNone(state: ScheduleState, vessel: VesselRecord) {
  const next = addSchedule(state, vessel)
  return recordNotFound(adoptLara(next, vessel.id, laraFrom(vessel), T0), vessel.id, T2)
}

function seedOpenMany(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  if (vessel.terminalCandidates.length < 2) return next
  return storePayloads(
    next,
    vessel.id,
    vessel.terminalCandidates.map((schedule) => snapshotFromCandidate(vessel, schedule)),
    T2,
  )
}

function markManual(state: ScheduleState, vessel: VesselRecord) {
  const current = terminalFrom(vessel)
  return editTerminalFields(state, {
    scheduleId: vessel.id,
    fields: { etd: current.etd },
    reason: 'Terminal confirmed',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
}

function seedMissingVoyageAfterManual(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, current, T0, true)
  next = markManual(next, vessel)
  return adoptTerminal(next, vessel.id, { ...current, exportVoyage: '', importVoyage: '' }, T2, true)
}

function bindTerminal(state: ScheduleState, vessel: VesselRecord) {
  if (!hasTerminal(vessel)) return state
  return adoptTerminal(state, vessel.id, terminalFrom(vessel), T0, true)
}

function addSchedule(state: ScheduleState, vessel: VesselRecord) {
  const schedule: VesselSchedule = {
    id: vessel.id,
    createdFrom: 'LARA',
    laraVoyage: vessel.laraVoyage,
    pointCode: vessel.pointCode,
    visitNo: vessel.visitNo,
    laraPoolLocation: vessel.laraPoolLocation,
    platformOmit: false,
    laraVersionId: null,
    matchId: null,
    ...emptyListColumns(),
  }
  return { ...state, schedules: [...state.schedules, schedule] }
}

function adoptLara(state: ScheduleState, scheduleId: string, snapshot: LaraSnapshot, at: string, apply = true) {
  const issued = nextId(state, 'lara-payload')
  const payload = { ...snapshot, id: issued.id, runId: 'seed-lara', scheduleId, capturedAt: at }
  const next = { ...issued.state, laraPayloads: [...issued.state.laraPayloads, payload] }
  if (!apply) return next
  return applyLaraPayload(next, { scheduleId, payloadId: payload.id, updatedBy: 'System', updatedAt: at })
}

function adoptTerminal(state: ScheduleState, scheduleId: string, snapshot: TerminalSnapshot, at: string, apply: boolean) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const queryIssued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: queryIssued.id,
    syncRunId: 'seed-terminal',
    scheduleId,
    laraVersionId: schedule?.laraVersionId ?? '',
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
  const payload = { ...snapshot, id: payloadIssued.id, queryId: query.id, scheduleId }
  next = { ...payloadIssued.state, terminalPayloads: [...payloadIssued.state.terminalPayloads, payload] }
  if (!apply) return next
  return applyTerminalPayload(next, { scheduleId, payloadId: payload.id, updatedBy: 'System', updatedAt: at })
}

function storePayloads(state: ScheduleState, scheduleId: string, snapshots: TerminalSnapshot[], at: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const queryIssued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: queryIssued.id,
    syncRunId: 'seed-terminal',
    scheduleId,
    laraVersionId: schedule?.laraVersionId ?? '',
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
    const payload = { ...snapshot, id: payloadIssued.id, queryId: query.id, scheduleId }
    next = { ...payloadIssued.state, terminalPayloads: [...payloadIssued.state.terminalPayloads, payload] }
  }
  if (snapshots.length === 1) return next
  return settleOpenShape(next, { scheduleId, queryId: query.id, updatedBy: 'System', updatedAt: at })
}

function recordNotFound(state: ScheduleState, scheduleId: string, at: string) {
  const schedule = state.schedules.find((item) => item.id === scheduleId)
  const issued = nextId(state, 'terminal-query')
  const query: TerminalQuery = {
    id: issued.id,
    syncRunId: 'seed-terminal',
    scheduleId,
    laraVersionId: schedule?.laraVersionId ?? '',
    trigger: 'SCHEDULE',
    requestedAt: at,
    requestedBy: 'System',
    externalVoyage: '',
    status: 'NOT_FOUND',
    respondedAt: at,
    failureReason: '',
  }
  const next = { ...issued.state, terminalQueries: [...issued.state.terminalQueries, query] }
  return settleOpenShape(next, { scheduleId, queryId: query.id, updatedBy: 'System', updatedAt: at })
}

function snapshotFromCandidate(vessel: VesselRecord, schedule: TerminalSchedule): TerminalSnapshot {
  const base = terminalFrom(vessel)
  return {
    ...base,
    importVoyage: schedule.ivoyage || base.importVoyage,
    exportVoyage: schedule.evoyage || base.exportVoyage,
    vesselNameCn: schedule.vesselNameCn || base.vesselNameCn,
    vesselStatus: schedule.status || base.vesselStatus,
    eta: schedule.eta ?? '',
    ata: schedule.ata ?? '',
    etb: schedule.etb ?? '',
    etd: schedule.etd ?? '',
    atb: schedule.atb ?? '',
    atd: schedule.atd ?? '',
    cyOpen: schedule.cyOpen ?? '',
    cyCutoff: schedule.cyClosing ?? '',
    updateTime: schedule.updateTime ?? '',
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
    vesselOperator: vessel.vesselOperator,
    exportVoyage: vessel.externalExportVoyage || vessel.externalVoyage,
    importVoyage: vessel.externalImportVoyage,
    vesselNameCn: vessel.terminalSchedule?.vesselNameCn ?? '',
    terminalName: vessel.terminalName,
    eta: vessel.tmlEta,
    ata: vessel.tmlAta,
    etb: vessel.tmlEtb,
    atb: vessel.tmlAtb,
    etd: vessel.tmlEtd,
    atd: vessel.tmlAtd,
    cyOpen: vessel.cyOpen,
    cyCutoff: vessel.cyCutoff,
    vesselStatus: vessel.terminalSchedule?.status || vessel.terminalScheduleStatus,
    updateTime: vessel.terminalSchedule?.updateTime ?? '',
  }
}

function shiftIso(value: string, days: number) {
  const time = Date.parse(value)
  if (!value || Number.isNaN(time)) return value
  return new Date(time + days * 24 * 60 * 60 * 1000).toISOString()
}
