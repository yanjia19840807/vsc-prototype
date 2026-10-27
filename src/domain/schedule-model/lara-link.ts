import { nextId } from '@/domain/schedule-model/state'
import type { LaraLink, ScheduleState } from '@/domain/schedule-model/types'

export function linkToLara(
  state: ScheduleState,
  input: { sourceScheduleId: string; targetScheduleId: string; reason: string; updatedBy: string; updatedAt: string },
) {
  const source = state.schedules.find((schedule) => schedule.id === input.sourceScheduleId)
  const target = state.schedules.find((schedule) => schedule.id === input.targetScheduleId)
  if (!source || source.createdFrom !== 'MANUAL') throw new Error('Link source must be a manual schedule')
  if (!target || target.createdFrom !== 'LARA') throw new Error('Link target must be a formal LARA schedule')
  if (state.laraLinks.some((link) => link.sourceScheduleId === source.id || link.targetScheduleId === target.id)) {
    throw new Error('A schedule can take part in only one LARA link')
  }
  const issued = nextId(state, 'lara-link')
  const link: LaraLink = {
    id: issued.id,
    sourceScheduleId: source.id,
    targetScheduleId: target.id,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return { ...issued.state, laraLinks: [...issued.state.laraLinks, link] }
}
