<script setup lang="ts">
import { computed } from 'vue'

import ReadonlyField from '@/components/ReadonlyField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
import { mappingStatusRemark } from '@/features/vessel-schedule/mapping-header'
import {
  PLATFORM_HEADER_COLUMNS,
  isWarningCellText,
  searchCellText,
} from '@/features/vessel-search/search-columns'
import type { VesselRecord } from '@/types/vsp'

const STATUS_COLUMNS = new Set(['mappingStatus', 'lastSyncStatus'])

const props = defineProps<{
  vessel: VesselRecord
}>()

const remark = computed(() => mappingStatusRemark(props.vessel))

function cellText(columnId: string) {
  return searchCellText(props.vessel, columnId)
}
</script>

<template>
  <dl class="grid sm:grid-cols-2 sm:gap-x-6">
    <ReadonlyField v-for="column in PLATFORM_HEADER_COLUMNS" :key="column.id" :label="column.label">
      <StatusBadge v-if="STATUS_COLUMNS.has(column.id)" :status="cellText(column.id)" />
      <span
        v-else
        :class="isWarningCellText(cellText(column.id), column.id) ? 'text-amber-800' : undefined"
      >
        {{ cellText(column.id) }}
      </span>
      <span
        v-if="column.id === 'mappingStatus' && remark"
        class="ml-2 text-xs text-muted-foreground"
      >
        {{ remark }}
      </span>
      <SyncFieldAlert :schedule-id="vessel.id" :column-id="column.id" />
    </ReadonlyField>
  </dl>
</template>
