import type { ScheduleState } from '@/domain/schedule-model/types'

export function emptyScheduleState(): ScheduleState {
  return {
    seq: 1,
    calls: [],
    laraVersions: [],
    terminalVersions: [],
    matches: [],
    fieldDecisions: [],
    laraPayloads: [],
    terminalPayloads: [],
    laraRuns: [],
    terminalSyncRuns: [],
    terminalQueries: [],
    laraLinks: [],
  }
}

export function nextId(state: ScheduleState, prefix: string): { state: ScheduleState; id: string } {
  const id = `${prefix}-${state.seq}`
  return { state: { ...state, seq: state.seq + 1 }, id }
}

/** LARA call identity: voyage, point code, pool location, visit no. */
export function callKey(laraVoyage: string, pointCode: string, laraPoolLocation: string, visitNo: string) {
  return `${laraVoyage}\u0000${pointCode}\u0000${laraPoolLocation}\u0000${visitNo}`
}

export function isLinkSource(state: ScheduleState, callId: string) {
  return state.laraLinks.some((link) => link.sourceCallId === callId)
}

export function isLinkTarget(state: ScheduleState, callId: string) {
  return state.laraLinks.some((link) => link.targetCallId === callId)
}

export function findCall(
  state: ScheduleState,
  laraVoyage: string,
  pointCode: string,
  laraPoolLocation: string,
  visitNo: string,
) {
  return state.calls.find(
    (call) =>
      call.laraVoyage === laraVoyage
      && call.pointCode === pointCode
      && call.laraPoolLocation === laraPoolLocation
      && call.visitNo === visitNo
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
