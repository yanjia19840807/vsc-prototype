import type { InjectionKey } from 'vue'

import type { FieldReview } from '@/domain/schedule-model'
import { bindingFor } from '@/features/vessel-schedule/sync-columns'

export type SyncCellInfo = {
  field: FieldReview
}

export function showsUnsettledDash(status: string, columnId: string) {
  return status === 'Pending match' && bindingFor(columnId)?.side === 'TERMINAL'
}

export const syncCellKey: InjectionKey<(scheduleId: string, columnId: string) => SyncCellInfo | null> = Symbol('syncCell')

export const syncPendingKey: InjectionKey<(scheduleId: string) => boolean> = Symbol('syncPending')
