import { currentTerminal, laraVersion, matchOf } from '@/domain/schedule-model/sync-diff'
import { emptyLaraSnapshot, emptyTerminalSnapshot, pickLara, pickTerminal } from '@/domain/schedule-model/snapshot'
import type { LaraSnapshot, ScheduleState, TerminalSnapshot, VesselSchedule } from '@/domain/schedule-model/types'

export function displayedLara(state: ScheduleState, schedule: VesselSchedule): LaraSnapshot {
  return pickLara(laraVersion(state, schedule.laraVersionId) ?? emptyLaraSnapshot())
}

export function displayedTerminal(state: ScheduleState, schedule: VesselSchedule): TerminalSnapshot {
  return pickTerminal(currentTerminal(state, schedule) ?? emptyTerminalSnapshot())
}

export function displayedMatch(state: ScheduleState, schedule: VesselSchedule) {
  return matchOf(state, schedule)
}
