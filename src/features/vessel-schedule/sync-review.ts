import type { InjectionKey } from 'vue'

import type { FieldReview } from '@/domain/schedule-model'

export type SyncCellInfo = {
  field: FieldReview
}

export const syncCellKey: InjectionKey<(scheduleId: string, columnId: string) => SyncCellInfo | null> = Symbol('syncCell')

export const syncPendingKey: InjectionKey<(scheduleId: string) => boolean> = Symbol('syncPending')
