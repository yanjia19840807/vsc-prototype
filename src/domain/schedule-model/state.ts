import type { ScheduleState } from '@/domain/schedule-model/types'

export function emptyScheduleState(): ScheduleState {
  return {
    seq: 1,
    laraRuns: [],
    laraRecords: [],
    terminalBatches: [],
    terminalQueries: [],
    terminalCandidates: [],
    calls: [],
    manualLaras: [],
    manualTerminals: [],
    bindings: [],
    laraLinks: [],
    fieldHistory: [],
  }
}

export function nextId(state: ScheduleState, prefix: string): { state: ScheduleState; id: string } {
  const id = `${prefix}-${state.seq}`
  return { state: { ...state, seq: state.seq + 1 }, id }
}

export function callKey(internalVoyage: string, poolLocation: string, portCode: string) {
  return `${internalVoyage}\u0000${poolLocation}\u0000${portCode}`
}

export function isLinkSource(state: ScheduleState, callId: string) {
  return state.laraLinks.some((link) => link.sourceCallId === callId)
}

/** Same Voyage + Pool location + Point code, including an active manual row. Linked sources are skipped. */
export function findLaraCall(state: ScheduleState, internalVoyage: string, poolLocation: string, portCode: string) {
  return state.calls.find(
    (call) =>
      call.internalVoyage === internalVoyage
      && call.poolLocation === poolLocation
      && call.portCode === portCode
      && !isLinkSource(state, call.id),
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

export function parseTime(value: string | null | undefined) {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

export function inRange(value: string, from: string | null, to: string | null) {
  const time = parseTime(value)
  const start = parseTime(from)
  const end = parseTime(to)
  if (time == null || start == null || end == null) return false
  return time >= start && time <= end
}

export function addDays(value: string, days: number) {
  const time = parseTime(value)
  if (time == null) return null
  return time + days * DAY_MS
}
