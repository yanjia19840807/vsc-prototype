import { applyLaraPayload } from '@/domain/schedule-model/sync-diff'
import {
  inRange,
  isLinkSource,
  isLinkTarget,
  nextId,
} from '@/domain/schedule-model/state'
import type {
  LaraPayload,
  LaraPayloadInput,
  LaraSyncRun,
  LaraSyncScope,
  ScheduleState,
  ScheduleTrigger,
  VesselCall,
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
    callId?: string | null
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
    callId: single ? (input.callId ?? null) : null,
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
    const requestedId = record.callId || (run.scope === 'SINGLE' ? run.callId ?? undefined : undefined)
    let call = requestedId ? next.calls.find((item) => item.id === requestedId) : undefined
    if (requestedId && !call) throw new Error('Vessel call was not found')
    const attributes = {
      laraVoyage: record.laraVoyage,
      pointCode: record.pointCode,
      laraPoolLocation: record.laraPoolLocation,
    }
    if (!call) {
      const issued = nextId(next, 'call')
      const created: VesselCall = {
        id: issued.id,
        createdFrom: 'LARA',
        ...attributes,
        visitNo: '1',
        platformOmit: false,
        laraVersionId: null,
        matchId: null,
      }
      next = { ...issued.state, calls: [...issued.state.calls, created] }
      call = created
    } else {
      next = updateCall(next, call.id, attributes)
    }
    seen.add(call.id)
    if (isLinkSource(next, call.id) || isLinkTarget(next, call.id)) continue
    const payloadIssued = nextId(next, 'lara-payload')
    const payload: LaraPayload = { ...record, id: payloadIssued.id, runId: run.id, callId: call.id, capturedAt: input.respondedAt }
    next = { ...payloadIssued.state, laraPayloads: [...payloadIssued.state.laraPayloads, payload] }
    next = applyLaraPayload(next, { callId: call.id, payloadId: payload.id, updatedBy: run.triggeredBy, updatedAt: input.respondedAt })
    next = updateCall(next, call.id, { platformOmit: false })
  }
  if (run.scope === 'BATCH') next = markOmissions(next, run, seen)
  return next
}

function markOmissions(state: ScheduleState, run: LaraSyncRun, seen: Set<string>) {
  const previous = [...state.laraRuns].reverse().find((item) => item.id !== run.id && item.scope === 'BATCH' && item.status === 'SUCCEEDED')
  if (!previous) return state
  let next = state
  for (const payload of state.laraPayloads.filter((item) => item.runId === previous.id)) {
    if (seen.has(payload.callId)) continue
    const call = next.calls.find((item) => item.id === payload.callId)
    if (!call || isLinkSource(next, call.id) || call.platformOmit) continue
    const stillInside = inRange(payload.laraEta, run.etaFrom, run.etaTo) || inRange(payload.laraEtb, run.etbFrom, run.etbTo)
    if (!stillInside) continue
    next = updateCall(next, call.id, { platformOmit: true })
  }
  return next
}

function replaceRun(state: ScheduleState, run: LaraSyncRun) {
  return { ...state, laraRuns: state.laraRuns.map((item) => (item.id === run.id ? run : item)) }
}

function updateCall(state: ScheduleState, callId: string, patch: Partial<VesselCall>) {
  return { ...state, calls: state.calls.map((call) => (call.id === callId ? { ...call, ...patch } : call)) }
}
