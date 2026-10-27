import { CURRENT_USER } from '@/mock/ports'
import {
  acceptLaraField,
  acceptTerminalField,
  applyLaraPayload,
  applyTerminalPayload,
  editLaraFields,
  editTerminalFields,
  keepLaraField,
  keepTerminalField,
  keepTerminalShape,
} from '@/domain/schedule-model/sync-diff'
import type { LaraField } from '@/domain/schedule-model/snapshot'
import { emptyScheduleState, nextId } from '@/domain/schedule-model/state'
import type {
  LaraSnapshot,
  ScheduleState,
  TerminalQuery,
  TerminalSnapshot,
  VesselSchedule,
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

type ScenarioSeed = (state: ScheduleState, vessel: VesselRecord, patches: ScheduleDisplayPatch[]) => ScheduleState

const scenarioSeeders: Record<string, ScenarioSeed> = {
  v6: (state, vessel) => seedHeldVoyage(state, vessel),
  v26: (state, vessel) => seedManyAfterMatch(state, vessel),
  v29: (state, vessel) => seedNoneAfterMatch(state, vessel),
  v32: (state, vessel) => seedPendingLara(state, vessel, 'laraEtb'),
  v33: (state, vessel) => seedPendingTerminal(state, vessel, { etb: 1 }),
  v34: (state, vessel) => seedPendingBoth(state, vessel),
  v35: (state, vessel) => seedKeptLara(state, vessel),
  v36: (state, vessel) => seedAcceptedLara(state, vessel),
  v37: (state, vessel) => seedUnwatchedEta(state, vessel),
  v38: (state, vessel) => seedAppliedVoyage(state, vessel),
  v39: (state, vessel) => seedAppliedTerminalEtb(state, vessel),
  v40: (state, vessel) => seedMixedLaraPending(state, vessel),
  v41: (state, vessel) => seedKeptShape(state, vessel),
  v42: (state, vessel) => seedPendingTerminal(state, vessel, { etb: 1, exportVoyage: '-S' }),
  v44: (state, vessel) => seedKeptTerminal(state, vessel),
  v45: (state, vessel) => seedAcceptedTerminal(state, vessel),
}

export function seedSchedule(vessels: VesselRecord[]) {
  let state = emptyScheduleState()
  const patches: ScheduleDisplayPatch[] = []
  for (const vessel of vessels) {
    const seed = scenarioSeeders[vessel.id]
    state = seed ? seed(state, vessel, patches) : seedAuto(state, vessel, patches)
  }
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
  return adoptTerminal(next, vessel.id, { ...current, exportVoyage: `${current.exportVoyage}-S` }, T2, false)
}

function seedManyAfterMatch(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  const edited = vessel.manualOverrides.tmlEtd?.source || vessel.manualOverrides.etd?.source
  next = adoptTerminal(next, vessel.id, edited ? { ...current, etd: edited } : current, T0, true)
  if (edited) {
    next = editTerminalFields(next, {
      scheduleId: vessel.id,
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
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  if (hasTerminal(vessel)) next = adoptTerminal(next, vessel.id, terminalFrom(vessel), T0, true)
  return recordNotFound(next, vessel.id, T2)
}

function seedPendingLara(state: ScheduleState, vessel: VesselRecord, field: Extract<LaraField, 'laraEtb' | 'laraEtd'>) {
  let next = addSchedule(state, vessel)
  const current = laraFrom(vessel)
  next = adoptLara(next, vessel.id, { ...current, [field]: shiftIso(current[field], -1) }, T0)
  next = bindTerminal(next, vessel)
  next = editLaraFields(next, {
    scheduleId: vessel.id,
    fields: { [field]: current[field] },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  return adoptLara(next, vessel.id, { ...current, [field]: shiftIso(current[field], 1) }, T2, false)
}

function seedPendingTerminal(
  state: ScheduleState,
  vessel: VesselRecord,
  change: { etb?: number; etd?: number; exportVoyage?: string },
) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  const prior = shiftedTerminal(current, change, -1)
  const incoming = shiftedTerminal(current, change, 1)
  next = adoptTerminal(next, vessel.id, { ...current, ...prior }, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: pickedTerminal(current, change),
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  return adoptTerminal(next, vessel.id, { ...current, ...incoming }, T2, false)
}

function seedPendingBoth(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  const lara = laraFrom(vessel)
  const terminal = terminalFrom(vessel)
  next = adoptLara(next, vessel.id, { ...lara, laraEtd: shiftIso(lara.laraEtd, -1) }, T0)
  next = adoptTerminal(next, vessel.id, { ...terminal, etd: shiftIso(terminal.etd, -1) }, T0, true)
  next = editLaraFields(next, {
    scheduleId: vessel.id,
    fields: { laraEtd: lara.laraEtd },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { etd: terminal.etd },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  next = adoptLara(next, vessel.id, { ...lara, laraEtd: shiftIso(lara.laraEtd, 1) }, T2, false)
  return adoptTerminal(next, vessel.id, { ...terminal, etd: shiftIso(terminal.etd, 1) }, T2, false)
}

function seedKeptLara(state: ScheduleState, vessel: VesselRecord) {
  const next = seedPendingLara(state, vessel, 'laraEtb')
  return keepLaraField(next, {
    scheduleId: vessel.id,
    payloadId: latestLaraPayloadId(next, vessel.id),
    field: 'laraEtb',
    updatedBy: CURRENT_USER,
    updatedAt: T2,
  })
}

function seedAcceptedLara(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  const current = laraFrom(vessel)
  next = adoptLara(next, vessel.id, { ...current, laraEtb: shiftIso(current.laraEtb, -1) }, T0)
  next = bindTerminal(next, vessel)
  next = editLaraFields(next, {
    scheduleId: vessel.id,
    fields: { laraEtb: shiftIso(current.laraEtb, -2) },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  next = adoptLara(next, vessel.id, current, T2, false)
  return acceptLaraField(next, {
    scheduleId: vessel.id,
    payloadId: latestLaraPayloadId(next, vessel.id),
    field: 'laraEtb',
    updatedBy: CURRENT_USER,
    updatedAt: T2,
  })
}

function seedKeptTerminal(state: ScheduleState, vessel: VesselRecord) {
  const next = seedPendingTerminal(state, vessel, { etb: 1 })
  return keepTerminalField(next, {
    scheduleId: vessel.id,
    payloadId: latestTerminalPayloadId(next, vessel.id),
    field: 'etb',
    updatedBy: CURRENT_USER,
    updatedAt: T2,
  })
}

function seedAcceptedTerminal(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, { ...current, etb: shiftIso(current.etb, -1) }, T0, true)
  next = editTerminalFields(next, {
    scheduleId: vessel.id,
    fields: { etb: shiftIso(current.etb, -2) },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  next = adoptTerminal(next, vessel.id, current, T2, false)
  return acceptTerminalField(next, {
    scheduleId: vessel.id,
    payloadId: latestTerminalPayloadId(next, vessel.id),
    field: 'etb',
    updatedBy: CURRENT_USER,
    updatedAt: T2,
  })
}

function seedUnwatchedEta(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  const current = laraFrom(vessel)
  next = adoptLara(next, vessel.id, { ...current, laraEta: shiftIso(current.laraEta, -1) }, T0)
  next = adoptLara(next, vessel.id, current, T2)
  return bindTerminal(next, vessel)
}

function seedAppliedVoyage(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, { ...current, exportVoyage: `${current.exportVoyage}-P` }, T0, true)
  return adoptTerminal(next, vessel.id, current, T2, true)
}

function seedAppliedTerminalEtb(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  next = adoptLara(next, vessel.id, laraFrom(vessel), T0)
  const current = terminalFrom(vessel)
  next = adoptTerminal(next, vessel.id, { ...current, etb: shiftIso(current.etb, -1) }, T0, true)
  return adoptTerminal(next, vessel.id, current, T2, true)
}

function seedMixedLaraPending(state: ScheduleState, vessel: VesselRecord) {
  let next = addSchedule(state, vessel)
  const lara = laraFrom(vessel)
  const terminal = terminalFrom(vessel)
  next = adoptLara(next, vessel.id, { ...lara, laraEtb: shiftIso(lara.laraEtb, -1) }, T0)
  next = adoptTerminal(next, vessel.id, { ...terminal, etb: shiftIso(terminal.etb, -1) }, T0, true)
  next = editLaraFields(next, {
    scheduleId: vessel.id,
    fields: { laraEtb: lara.laraEtb },
    reason: 'User edit',
    updatedBy: CURRENT_USER,
    updatedAt: T1,
  })
  next = adoptTerminal(next, vessel.id, terminal, T2, true)
  return adoptLara(next, vessel.id, { ...lara, laraEtb: shiftIso(lara.laraEtb, 1) }, T2, false)
}

function seedKeptShape(state: ScheduleState, vessel: VesselRecord) {
  const next = seedNoneAfterMatch(state, vessel)
  return keepTerminalShape(next, {
    scheduleId: vessel.id,
    queryId: latestQueryId(next, vessel.id),
    updatedBy: CURRENT_USER,
    updatedAt: T2,
  })
}

function bindTerminal(state: ScheduleState, vessel: VesselRecord) {
  if (!hasTerminal(vessel)) return state
  return adoptTerminal(state, vessel.id, terminalFrom(vessel), T0, true)
}

function shiftedTerminal(current: TerminalSnapshot, change: { etb?: number; etd?: number; exportVoyage?: string }, direction: -1 | 1) {
  const next: Partial<TerminalSnapshot> = {}
  if (change.etb) next.etb = shiftIso(current.etb, direction * change.etb)
  if (change.etd) next.etd = shiftIso(current.etd, direction * change.etd)
  if (change.exportVoyage) {
    next.exportVoyage = direction < 0 ? `${current.exportVoyage}-P` : `${current.exportVoyage}${change.exportVoyage}`
  }
  return next
}

function pickedTerminal(current: TerminalSnapshot, change: { etb?: number; etd?: number; exportVoyage?: string }) {
  const fields: Partial<TerminalSnapshot> = {}
  if (change.etb) fields.etb = current.etb
  if (change.etd) fields.etd = current.etd
  if (change.exportVoyage) fields.exportVoyage = current.exportVoyage
  return fields
}

function latestLaraPayloadId(state: ScheduleState, scheduleId: string) {
  const payload = [...state.laraPayloads].reverse().find((item) => item.scheduleId === scheduleId)
  if (!payload) throw new Error(`LARA payload was not found for ${scheduleId}`)
  return payload.id
}

function latestTerminalPayloadId(state: ScheduleState, scheduleId: string) {
  const payload = [...state.terminalPayloads].reverse().find((item) => item.scheduleId === scheduleId)
  if (!payload) throw new Error(`Terminal payload was not found for ${scheduleId}`)
  return payload.id
}

function latestQueryId(state: ScheduleState, scheduleId: string) {
  const query = [...state.terminalQueries].reverse().find((item) => item.scheduleId === scheduleId)
  if (!query) throw new Error(`Terminal query was not found for ${scheduleId}`)
  return query.id
}

function addSchedule(state: ScheduleState, vessel: VesselRecord) {
  const schedule: VesselSchedule = {
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
  return next
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
  return { ...issued.state, terminalQueries: [...issued.state.terminalQueries, query] }
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
