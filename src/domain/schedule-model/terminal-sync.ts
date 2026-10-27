import { displayedLara, displayedTerminal } from '@/domain/schedule-model/display'
import { applyTerminalPayload, hasBoundMatch, laraVersion, type SyncPolicy } from '@/domain/schedule-model/sync-diff'
import { addDays, isLinkSource, isLinkTarget, nextId, parseTime } from '@/domain/schedule-model/state'
import type {
  ScheduleState,
  ScheduleTrigger,
  TerminalPayload,
  TerminalPayloadInput,
  TerminalQuery,
  TerminalQueryStatus,
  TerminalQueryTrigger,
  TerminalSyncRun,
  VesselSchedule,
} from '@/domain/schedule-model/types'

const DEFAULT_ETA_LEAD_DAYS = 15
const DEFAULT_ATD_LAG_DAYS = 5

export function openTerminalSync(
  state: ScheduleState,
  input: {
    trigger: ScheduleTrigger
    startedAt: string
    triggeredBy: string
    etaLeadDays?: number
    atdLagDays?: number
    failedToIssue?: string
  },
) {
  const etaLeadDays = input.etaLeadDays ?? DEFAULT_ETA_LEAD_DAYS
  const atdLagDays = input.atdLagDays ?? DEFAULT_ATD_LAG_DAYS
  const issued = nextId(state, 'terminal-sync')
  const run: TerminalSyncRun = {
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
  let next = { ...issued.state, terminalSyncRuns: [...issued.state.terminalSyncRuns, run] }
  if (input.failedToIssue) return next
  const due = next.schedules.filter((schedule) => !isLinkSource(next, schedule.id) && !isLinkTarget(next, schedule.id) && isDue(next, schedule, input.startedAt, etaLeadDays, atdLagDays))
  for (const schedule of due) {
    next = appendQuery(next, schedule, {
      syncRunId: run.id,
      trigger: 'SCHEDULE',
      requestedAt: input.startedAt,
      requestedBy: input.triggeredBy,
      externalVoyage: '',
    })
  }
  return replaceRun(next, { ...run, callCount: due.length })
}

export function openSingleTerminalQuery(
  state: ScheduleState,
  input: {
    scheduleId: string
    trigger: Extract<TerminalQueryTrigger, 'MANUAL' | 'REMATCH'>
    requestedAt: string
    requestedBy: string
    externalVoyage?: string
  },
) {
  const schedule = state.schedules.find((item) => item.id === input.scheduleId)
  if (!schedule) throw new Error('Vessel schedule was not found')
  if (isLinkSource(state, schedule.id) || isLinkTarget(state, schedule.id)) throw new Error('A linked schedule is left out of sync')
  return appendQuery(state, schedule, {
    syncRunId: null,
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
    candidates?: TerminalPayloadInput[]
    policy?: SyncPolicy
    /** When set, only Auto matched and Manual matched compare. Otherwise a bound match is compared. */
    matchingStatus?: string
  },
) {
  const query = state.terminalQueries.find((item) => item.id === input.queryId)
  if (!query || query.status !== 'PENDING') throw new Error('Terminal query is not pending')
  let next = replaceQuery(state, {
    ...query,
    status: input.status,
    respondedAt: input.respondedAt,
    failureReason: input.status === 'FAILED' ? (input.failureReason ?? '') : '',
  })
  const payloads: TerminalPayload[] = []
  if (input.status === 'FOUND') {
    for (const candidate of input.candidates ?? []) {
      const issued = nextId(next, 'terminal-payload')
      const payload: TerminalPayload = { ...candidate, id: issued.id, queryId: query.id, scheduleId: query.scheduleId }
      payloads.push(payload)
      next = { ...issued.state, terminalPayloads: [...issued.state.terminalPayloads, payload] }
    }
  }
  if (!isLinkSource(next, query.scheduleId) && !isLinkTarget(next, query.scheduleId)) {
    const comparable = input.matchingStatus
      ? input.matchingStatus === 'Auto matched' || input.matchingStatus === 'Manual matched'
      : hasBoundMatch(next, query.scheduleId)
    const hasTerminal = hasBoundMatch(next, query.scheduleId)
    if (!comparable) {
      if (!hasTerminal && input.status === 'FOUND' && payloads.length === 1) {
        next = applyTerminalPayload(next, {
          scheduleId: query.scheduleId,
          payloadId: payloads[0]!.id,
          updatedBy: query.requestedBy,
          updatedAt: input.respondedAt,
          policy: input.policy,
        })
      }
    } else if (input.status === 'FOUND' && payloads.length === 1) {
      next = applyTerminalPayload(next, {
        scheduleId: query.scheduleId,
        payloadId: payloads[0]!.id,
        updatedBy: query.requestedBy,
        updatedAt: input.respondedAt,
        policy: input.policy,
      })
    }
  }
  if (query.syncRunId) next = settleRun(next, query.syncRunId, input.respondedAt)
  return next
}

function settleRun(state: ScheduleState, runId: string, finishedAt: string) {
  const run = state.terminalSyncRuns.find((item) => item.id === runId)
  if (!run) return state
  const queries = state.terminalQueries.filter((item) => item.syncRunId === runId)
  if (queries.some((item) => item.status === 'PENDING')) return state
  const failedCount = queries.filter((item) => item.status === 'FAILED').length
  const succeededCount = queries.filter((item) => item.status === 'FOUND' || item.status === 'NOT_FOUND').length
  const status = failedCount === 0 ? 'SUCCEEDED' : 'PARTIAL'
  return replaceRun(state, { ...run, status, finishedAt, succeededCount, failedCount, callCount: queries.length })
}

function appendQuery(
  state: ScheduleState,
  schedule: VesselSchedule,
  input: {
    syncRunId: string | null
    trigger: TerminalQueryTrigger
    requestedAt: string
    requestedBy: string
    externalVoyage: string
  },
) {
  const issued = nextId(state, 'terminal-query')
  const lara = laraVersion(state, schedule.laraVersionId)
  const terminal = displayedTerminal(state, schedule)
  const exportVoyage = terminal.exportVoyage.trim()
  const importVoyage = terminal.importVoyage.trim()
  const boundVoyage = input.externalVoyage.trim() || [exportVoyage, importVoyage].filter(Boolean).join(' / ')
  const query: TerminalQuery = {
    id: issued.id,
    syncRunId: input.syncRunId,
    scheduleId: schedule.id,
    laraVersionId: lara?.id ?? '',
    trigger: input.trigger,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    externalVoyage: boundVoyage,
    status: 'PENDING',
    respondedAt: null,
    failureReason: '',
  }
  return { ...issued.state, terminalQueries: [...issued.state.terminalQueries, query] }
}

function isDue(state: ScheduleState, schedule: VesselSchedule, runAt: string, etaLeadDays: number, atdLagDays: number) {
  const lara = displayedLara(state, schedule)
  const now = parseTime(runAt)
  const eta = addDays(lara.laraEta || lara.laraEtb, -etaLeadDays)
  if (now == null || eta == null || now < eta) return false
  const atd = displayedTerminal(state, schedule).atd
  if (!atd) return true
  const until = addDays(atd, atdLagDays)
  return until != null && now <= until
}

function replaceRun(state: ScheduleState, run: TerminalSyncRun) {
  return { ...state, terminalSyncRuns: state.terminalSyncRuns.map((item) => (item.id === run.id ? run : item)) }
}

function replaceQuery(state: ScheduleState, query: TerminalQuery) {
  return { ...state, terminalQueries: state.terminalQueries.map((item) => (item.id === query.id ? query : item)) }
}
