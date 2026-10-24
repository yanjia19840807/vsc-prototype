import { currentTerminal, laraVersion, matchOf } from '@/domain/schedule-model/sync-diff'
import { emptyLaraSnapshot, emptyTerminalSnapshot, pickLara, pickTerminal } from '@/domain/schedule-model/snapshot'
import type { LaraSnapshot, ScheduleState, TerminalSnapshot, VesselCall } from '@/domain/schedule-model/types'

export function displayedLara(state: ScheduleState, call: VesselCall): LaraSnapshot {
  return pickLara(laraVersion(state, call.laraVersionId) ?? emptyLaraSnapshot())
}

export function displayedTerminal(state: ScheduleState, call: VesselCall): TerminalSnapshot {
  return pickTerminal(currentTerminal(state, call) ?? emptyTerminalSnapshot())
}

export function displayedMatch(state: ScheduleState, call: VesselCall) {
  return matchOf(state, call)
}
