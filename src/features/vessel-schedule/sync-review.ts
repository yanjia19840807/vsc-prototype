import type { InjectionKey } from 'vue'

import type { FieldReview, ScheduleReview } from '@/domain/schedule-model'

export type SyncCellInfo = {
  field: FieldReview
}

/** Confirmed terminal values are still shown, and the latest terminal result has not been adopted. */
export function terminalDataExpired(
  matchingStatus: string,
  review: Pick<ScheduleReview, 'shape' | 'fields'>,
) {
  if (matchingStatus !== 'Manual matched') return false
  if (review.shape === 'none') return true
  return review.fields.some((field) => field.side === 'TERMINAL' && field.status === 'pending')
}

export const syncCellKey: InjectionKey<(scheduleId: string, columnId: string) => SyncCellInfo | null> = Symbol('syncCell')

export const syncPendingKey: InjectionKey<(scheduleId: string) => boolean> = Symbol('syncPending')
