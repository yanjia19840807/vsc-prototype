import { applyLaraPayload } from '@/domain/schedule-model/sync-diff'
import {
  inRange,
  nextId,
} from '@/domain/schedule-model/state'
import type {
  LaraPayload,
  LaraPayloadInput,
  LaraSyncRun,
  LaraSyncScope,
  ScheduleState,
  ScheduleTrigger,
  VesselSchedule,
} from '@/domain/schedule-model/types'

export function openLaraRun(
  state: ScheduleState,
  input: {
    scope: LaraSyncScope
    trigger: ScheduleTrigger
    requestedAt: string
    triggeredBy: string
    etaFrom?: string | null
    etaTo?: string | null
    etbFrom?: string | null
    etbTo?: string | null
    scheduleId?: string | null
  },
) {
  const issued = nextId(state, 'lara-run')
  const single = input.scope === 'SINGLE'
  const run: LaraSyncRun = {
    id: issued.id,
    scope: input.scope,
    trigger: input.trigger,
    status: 'RUNNING',
    etaFrom: single ? null : (input.etaFrom ?? null),
    etaTo: single ? null : (input.etaTo ?? null),
    etbFrom: single ? null : (input.etbFrom ?? null),
    etbTo: single ? null : (input.etbTo ?? null),
    scheduleId: single ? (input.scheduleId ?? null) : null,
    requestedAt: input.requestedAt,
    respondedAt: null,
    failureReason: '',
    recordCount: 0,
    triggeredBy: input.triggeredBy,
  }
  return { ...issued.state, laraRuns: [...issued.state.laraRuns, run] }
}

export function completeLaraRun(
  state: ScheduleState,
  input: {
    runId: string
    respondedAt: string
    failureReason?: string
    records?: LaraPayloadInput[]
  },
) {
  const run = state.laraRuns.find((item) => item.id === input.runId)
  if (!run || run.status !== 'RUNNING') throw new Error('LARA run is not running')
  if (input.failureReason) {
    return replaceRun(state, { ...run, status: 'FAILED', respondedAt: input.respondedAt, failureReason: input.failureReason, recordCount: 0 })
  }
  const records = input.records ?? []
  if (run.scope === 'SINGLE' && records.length === 0) {
    return replaceRun(state, { ...run, status: 'FAILED', respondedAt: input.respondedAt, failureReason: 'No LARA record', recordCount: 0 })
  }
  let next = replaceRun(state, { ...run, status: 'SUCCEEDED', respondedAt: input.respondedAt, failureReason: '', recordCount: records.length })
  const seen = new Set<string>()
  for (const record of records) {
    const requestedId = record.scheduleId || (run.scope === 'SINGLE' ? run.scheduleId ?? undefined : undefined)
    let schedule = requestedId ? next.schedules.find((item) => item.id === requestedId) : undefined
    if (requestedId && !schedule) throw new Error('Vessel schedule was not found')
    const attributes = {
      laraVoyage: record.laraVoyage,
      pointCode: record.pointCode,
      laraPoolLocation: record.laraPoolLocation,
    }
    if (!schedule) {
      const issued = nextId(next, 'schedule')
      const created: VesselSchedule = {
        id: issued.id,
        createdFrom: 'LARA',
        ...attributes,
        visitNo: '1',
        platformOmit: false,
        laraVersionId: null,
        matchId: null,
      }
      next = { ...issued.state, schedules: [...issued.state.schedules, created] }
      schedule = created
    } else {
      next = updateSchedule(next, schedule.id, attributes)
    }
    seen.add(schedule.id)
    const payloadIssued = nextId(next, 'lara-payload')
    const payload: LaraPayload = { ...record, id: payloadIssued.id, runId: run.id, scheduleId: schedule.id, capturedAt: input.respondedAt }
    next = { ...payloadIssued.state, laraPayloads: [...payloadIssued.state.laraPayloads, payload] }
    next = applyLaraPayload(next, { scheduleId: schedule.id, payloadId: payload.id, updatedBy: run.triggeredBy, updatedAt: input.respondedAt })
    next = updateSchedule(next, schedule.id, { platformOmit: false })
  }
  if (run.scope === 'BATCH') next = markOmissions(next, run, seen)
  return next
}

function markOmissions(state: ScheduleState, run: LaraSyncRun, seen: Set<string>) {
  const previous = [...state.laraRuns].reverse().find((item) => item.id !== run.id && item.scope === 'BATCH' && item.status === 'SUCCEEDED')
  if (!previous) return state
  let next = state
  for (const payload of state.laraPayloads.filter((item) => item.runId === previous.id)) {
    if (seen.has(payload.scheduleId)) continue
    const schedule = next.schedules.find((item) => item.id === payload.scheduleId)
    if (!schedule || schedule.platformOmit) continue
    const stillInside = inRange(payload.laraEta, run.etaFrom, run.etaTo) || inRange(payload.laraEtb, run.etbFrom, run.etbTo)
    if (!stillInside) continue
    next = updateSchedule(next, schedule.id, { platformOmit: true })
  }
  return next
}

function replaceRun(state: ScheduleState, run: LaraSyncRun) {
  return { ...state, laraRuns: state.laraRuns.map((item) => (item.id === run.id ? run : item)) }
}

function updateSchedule(state: ScheduleState, scheduleId: string, patch: Partial<VesselSchedule>) {
  return { ...state, schedules: state.schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, ...patch } : schedule)) }
}
