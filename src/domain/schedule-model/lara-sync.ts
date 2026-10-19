import {
  displayedLaraField,
  LARA_FIELDS,
  type LaraField,
} from '@/domain/schedule-model/display'
import { appendFieldChanges } from '@/domain/schedule-model/history'
import {
  callKey,
  findLaraCall,
  inRange,
  isLinkSource,
  nextId,
} from '@/domain/schedule-model/state'
import type {
  LaraRecordInput,
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
    internalVoyage?: string | null
    poolLocation?: string | null
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
    internalVoyage: single ? (input.internalVoyage ?? null) : null,
    poolLocation: single ? (input.poolLocation ?? null) : null,
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
    records?: LaraRecordInput[]
  },
) {
  const run = state.laraRuns.find((item) => item.id === input.runId)
  if (!run || run.status !== 'RUNNING') throw new Error('LARA run is not running')
  if (input.failureReason) return failLaraRun(state, run, input.respondedAt, input.failureReason)
  const records = input.records ?? []
  if (run.scope === 'SINGLE' && records.length === 0) {
    return failLaraRun(state, run, input.respondedAt, 'No LARA record')
  }
  return applyLaraSuccess(state, run, input.respondedAt, records)
}

function failLaraRun(state: ScheduleState, run: LaraSyncRun, respondedAt: string, failureReason: string) {
  return replaceRun(state, {
    ...run,
    status: 'FAILED',
    respondedAt,
    failureReason,
    recordCount: 0,
  })
}

function applyLaraSuccess(
  state: ScheduleState,
  run: LaraSyncRun,
  respondedAt: string,
  incoming: LaraRecordInput[],
) {
  let next = replaceRun(state, {
    ...run,
    status: 'SUCCEEDED',
    respondedAt,
    failureReason: '',
    recordCount: incoming.length,
  })
  const stored: { key: string; recordId: string; input: LaraRecordInput }[] = []
  for (const input of incoming) {
    const issued = nextId(next, 'lara-record')
    next = {
      ...issued.state,
      laraRecords: [
        ...issued.state.laraRecords,
        { ...input, id: issued.id, runId: run.id, capturedAt: respondedAt },
      ],
    }
    stored.push({
      key: callKey(input.internalVoyage, input.poolLocation, input.portCode),
      recordId: issued.id,
      input,
    })
  }

  const seen = new Set<string>()
  for (const item of stored) {
    seen.add(item.key)
    const existing = findLaraCall(next, item.input.internalVoyage, item.input.poolLocation, item.input.portCode)
    if (!existing) {
      const created = nextId(next, 'call')
      const call: VesselCall = {
        id: created.id,
        origin: 'LARA',
        internalVoyage: item.input.internalVoyage,
        poolLocation: item.input.poolLocation,
        portCode: item.input.portCode,
        laraRecordId: item.recordId,
        platformOmit: false,
        manualLaraId: null,
        manualTerminalId: null,
      }
      next = { ...created.state, calls: [...created.state.calls, call] }
      next = recordLaraDisplayDiff(next, call, undefined, item.input, respondedAt, run.triggeredBy)
      continue
    }
    next = recordLaraDisplayDiff(
      next,
      existing,
      previousRecordInput(next, existing),
      item.input,
      respondedAt,
      run.triggeredBy,
    )
    next = updateCall(next, existing.id, { laraRecordId: item.recordId, platformOmit: false })
  }

  if (run.scope === 'BATCH') next = markInWindowOmissions(next, run, seen)
  return next
}

function previousRecordInput(state: ScheduleState, call: VesselCall): LaraRecordInput | undefined {
  const record = state.laraRecords.find((item) => item.id === call.laraRecordId)
  if (!record) return undefined
  const { id: _id, runId: _runId, capturedAt: _capturedAt, ...input } = record
  return input
}

function recordLaraDisplayDiff(
  state: ScheduleState,
  call: VesselCall,
  previous: LaraRecordInput | undefined,
  nextRecord: LaraRecordInput,
  at: string,
  by: string,
) {
  const manualFields = state.manualLaras.find((manual) => manual.id === call.manualLaraId)?.fields
  return appendFieldChanges(
    state,
    LARA_FIELDS.filter((field) => !manualFields?.some((item) => item.field === field)).map((field) => ({
      callId: call.id,
      field,
      originalValue: previous?.[field] ?? '',
      updatedValue: nextRecord[field] ?? '',
      cause: 'SYNC' as const,
      updatedBy: by,
      updatedAt: at,
    })),
  )
}

function markInWindowOmissions(state: ScheduleState, run: LaraSyncRun, seen: Set<string>) {
  const previous = [...state.laraRuns]
    .reverse()
    .find((item) => item.id !== run.id && item.scope === 'BATCH' && item.status === 'SUCCEEDED')
  if (!previous) return state
  let next = state
  const previousRecords = state.laraRecords.filter((record) => record.runId === previous.id)
  for (const record of previousRecords) {
    const key = callKey(record.internalVoyage, record.poolLocation, record.portCode)
    if (seen.has(key)) continue
    const call = findLaraCall(next, record.internalVoyage, record.poolLocation, record.portCode)
    if (!call || isLinkSource(next, call.id) || call.platformOmit) continue
    const stillInside = inRange(record.eta, run.etaFrom, run.etaTo) || inRange(record.etb, run.etbFrom, run.etbTo)
    if (!stillInside) continue
    next = updateCall(next, call.id, { platformOmit: true })
  }
  return next
}

function replaceRun(state: ScheduleState, run: LaraSyncRun) {
  return { ...state, laraRuns: state.laraRuns.map((item) => (item.id === run.id ? run : item)) }
}

function updateCall(state: ScheduleState, callId: string, patch: Partial<VesselCall>) {
  return {
    ...state,
    calls: state.calls.map((call) => (call.id === callId ? { ...call, ...patch } : call)),
  }
}

export function displayedLaraSnapshot(state: ScheduleState, callId: string) {
  const call = state.calls.find((item) => item.id === callId)
  if (!call) return {}
  return Object.fromEntries(LARA_FIELDS.map((field: LaraField) => [field, displayedLaraField(state, call, field)]))
}
