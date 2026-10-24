import { nextId } from '@/domain/schedule-model/state'
import type { LaraLink, ScheduleState } from '@/domain/schedule-model/types'

export function linkToLara(
  state: ScheduleState,
  input: { sourceCallId: string; targetCallId: string; reason: string; updatedBy: string; updatedAt: string },
) {
  const source = state.calls.find((call) => call.id === input.sourceCallId)
  const target = state.calls.find((call) => call.id === input.targetCallId)
  if (!source || source.createdFrom !== 'MANUAL') throw new Error('Link source must be a manual call')
  if (!target || target.createdFrom !== 'LARA') throw new Error('Link target must be a formal LARA call')
  if (state.laraLinks.some((link) => link.sourceCallId === source.id || link.targetCallId === target.id)) {
    throw new Error('A call can take part in only one LARA link')
  }
  const issued = nextId(state, 'lara-link')
  const link: LaraLink = {
    id: issued.id,
    sourceCallId: source.id,
    targetCallId: target.id,
    reason: input.reason,
    updatedBy: input.updatedBy,
    updatedAt: input.updatedAt,
  }
  return { ...issued.state, laraLinks: [...issued.state.laraLinks, link] }
}
