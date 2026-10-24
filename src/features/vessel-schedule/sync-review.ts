import type { InjectionKey } from 'vue'

import type { FieldReview } from '@/domain/schedule-model'

export type SyncCellInfo = {
  field: FieldReview
}

export const syncCellKey: InjectionKey<(callId: string, columnId: string) => SyncCellInfo | null> = Symbol('syncCell')

export const syncPendingKey: InjectionKey<(callId: string) => boolean> = Symbol('syncPending')
