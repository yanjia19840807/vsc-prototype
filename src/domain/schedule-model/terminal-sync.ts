import { clearAutoBinding, setTerminalBinding } from '@/domain/schedule-model/binding'
import { displayedLaraField, displayedTerminalField } from '@/domain/schedule-model/display'
import { addDays, isLinkSource, nextId, parseTime } from '@/domain/schedule-model/state'
import type {
  ScheduleState,
  ScheduleTrigger,
  TerminalBatchRun,
  TerminalCandidateInput,
  TerminalQuery,
  TerminalQueryStatus,
  TerminalQueryTrigger,
  VesselCall,
} from '@/domain/schedule-model/types'

const DEFAULT_ETA_LEAD_DAYS = 15
const DEFAULT_ATD_LAG_DAYS = 5

export function openTerminalBatch(
  state: ScheduleState,
  input: {
    trigger: ScheduleTrigger
    startedAt: string
    triggeredBy: string
    etaLeadDays?: number
    atdLagDays?: number
    /** When the round cannot be sent, no queries are created. */
    failedToIssue?: string
  },
) {
  const etaLeadDays = input.etaLeadDays ?? DEFAULT_ETA_LEAD_DAYS
  const atdLagDays = input.atdLagDays ?? DEFAULT_ATD_LAG_DAYS
  const issued = nextId(state, 'terminal-batch')
  const batch: TerminalBatchRun = {
    id: issued.id,
    trigger: input.trigger,
    status: input.failedToIssue ? 'FAILED' : 'RUNNING',
    etaLeadDays,
    atdLagDays,
    startedAt: input.startedAt,
    finishedAt: input.failedToIssue ? input.startedAt : null,
    failureReason: input.failedToIssue ?? '',
    callCount: 0,
    succeededCount: 0,
    failedCount: 0,
    triggeredBy: input.triggeredBy,
  }
  let next = { ...issued.state, terminalBatches: [...issued.state.terminalBatches, batch] }
  if (input.failedToIssue) return next

  const due = next.calls.filter((call) => !isLinkSource(next, call.id) && isDue(next, call, input.startedAt, etaLeadDays, atdLagDays))
  for (const call of due) {
    next = appendQuery(next, call, {
      batchRunId: batch.id,
      trigger: 'SCHEDULE',
      requestedAt: input.startedAt,
      requestedBy: input.triggeredBy,
      externalVoyage: '',
    })
  }
  return replaceBatch(next, { ...batch, callCount: due.length })
}

/** One terminal call outside a batch. Ignores etaLeadDays and atdLagDays. */
export function openSingleTerminalQuery(
  state: ScheduleState,
  input: {
    callId: string
    trigger: Extract<TerminalQueryTrigger, 'MANUAL' | 'REMATCH'>
    requestedAt: string
    requestedBy: string
    externalVoyage?: string
  },
) {
  const call = requireCall(state, input.callId)
  if (isLinkSource(state, call.id)) throw new Error('An inactive linked manual call is left out of sync')
  return appendQuery(state, call, {
    batchRunId: null,
    trigger: input.trigger,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    externalVoyage: input.externalVoyage ?? '',
  })
}

export function completeTerminalQuery(
  state: ScheduleState,
  input: {
    queryId: string
    status: Extract<TerminalQueryStatus, 'FOUND' | 'NOT_FOUND' | 'FAILED'>
    respondedAt: string
    failureReason?: string
    candidates?: TerminalCandidateInput[]
  },
) {
  const query = state.terminalQueries.find((item) => item.id === input.queryId)
  if (!query || query.status !== 'PENDING') throw new Error('Terminal query is not pending')
  const call = state.calls.find((item) => item.id === query.callId)
  let next = replaceQuery(state, {
    ...query,
    status: input.status,
    respondedAt: input.respondedAt,
    failureReason: input.status === 'FAILED' ? (input.failureReason ?? '') : '',
  })
  if (input.status === 'FOUND') {
    for (const candidate of input.candidates ?? []) {
      const issued = nextId(next, 'candidate')
      next = {
        ...issued.state,
        terminalCandidates: [...issued.state.terminalCandidates, { ...candidate, id: issued.id, queryId: query.id }],
      }
    }
  }
  if (call && !isLinkSource(next, call.id)) {
    next = applyQueryToBinding(next, call, query.id, input)
  }
  if (query.batchRunId) next = settleBatch(next, query.batchRunId, input.respondedAt)
  return next
}

function applyQueryToBinding(
  state: ScheduleState,
  call: VesselCall,
  queryId: string,
  input: { status: 'FOUND' | 'NOT_FOUND' | 'FAILED'; respondedAt: string; candidates?: TerminalCandidateInput[] },
) {
  if (input.status === 'FAILED') return state
  const binding = state.bindings.find((item) => item.callId === call.id)
  if (input.status === 'NOT_FOUND') return clearAutoBinding(state, call, input.respondedAt, 'System')
  const candidates = state.terminalCandidates.filter((item) => item.queryId === queryId)
  if (candidates.length !== 1 || binding?.source === 'MANUAL') return state
  return setTerminalBinding(state, {
    call,
    mode: 'CANDIDATE',
    candidateId: candidates[0]!.id,
    source: 'AUTO',
    cause: 'BINDING',
    updatedBy: 'System',
    updatedAt: input.respondedAt,
  })
}

function settleBatch(state: ScheduleState, batchId: string, finishedAt: string) {
  const batch = state.terminalBatches.find((item) => item.id === batchId)
  if (!batch) return state
  const queries = state.terminalQueries.filter((item) => item.batchRunId === batchId)
  if (queries.some((item) => item.status === 'PENDING')) return state
  const failedCount = queries.filter((item) => item.status === 'FAILED').length
  const succeededCount = queries.filter((item) => item.status === 'FOUND' || item.status === 'NOT_FOUND').length
  const status = failedCount === 0 ? 'SUCCEEDED' : 'PARTIAL'
  return replaceBatch(state, { ...batch, status, finishedAt, succeededCount, failedCount, callCount: queries.length })
}

function appendQuery(
  state: ScheduleState,
  call: VesselCall,
  input: {
    batchRunId: string | null
    trigger: TerminalQueryTrigger
    requestedAt: string
    requestedBy: string
    externalVoyage: string
  },
) {
  const issued = nextId(state, 'terminal-query')
  const record = state.laraRecords.find((item) => item.id === call.laraRecordId)
  const exportVoyage = displayedTerminalField(state, call, 'exportVoyage').trim()
  const importVoyage = displayedTerminalField(state, call, 'importVoyage').trim()
  const boundVoyage = input.externalVoyage.trim() || [exportVoyage, importVoyage].filter(Boolean).join(' / ')
  const query: TerminalQuery = {
    id: issued.id,
    batchRunId: input.batchRunId,
    callId: call.id,
    laraRecordId: call.laraRecordId ?? '',
    internalVoyage: call.internalVoyage,
    poolLocation: call.poolLocation,
    portCode: displayedLaraField(state, call, 'portCode') || record?.portCode || '',
    trigger: input.trigger,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    vesselName: displayedLaraField(state, call, 'vesselName'),
    externalVoyage: boundVoyage,
    status: 'PENDING',
    respondedAt: null,
    failureReason: '',
  }
  return { ...issued.state, terminalQueries: [...issued.state.terminalQueries, query] }
}

function isDue(state: ScheduleState, call: VesselCall, runAt: string, etaLeadDays: number, atdLagDays: number) {
  const now = parseTime(runAt)
  const eta = addDays(displayedLaraField(state, call, 'eta'), -etaLeadDays)
  if (now == null || eta == null || now < eta) return false
  const atdValue = displayedTerminalField(state, call, 'atd')
  if (!atdValue) return true
  const until = addDays(atdValue, atdLagDays)
  return until != null && now <= until
}

function requireCall(state: ScheduleState, callId: string) {
  const call = state.calls.find((item) => item.id === callId)
  if (!call) throw new Error('Vessel call was not found')
  return call
}

function replaceBatch(state: ScheduleState, batch: TerminalBatchRun) {
  return { ...state, terminalBatches: state.terminalBatches.map((item) => (item.id === batch.id ? batch : item)) }
}

function replaceQuery(state: ScheduleState, query: TerminalQuery) {
  return { ...state, terminalQueries: state.terminalQueries.map((item) => (item.id === query.id ? query : item)) }
}
