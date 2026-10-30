<script setup lang="ts">
import { computed } from 'vue'

import CoverageIcon from '@/components/CoverageIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SyncFieldAlert from '@/features/vessel-schedule/SyncFieldAlert.vue'
import { showsUnsettledDash } from '@/features/vessel-schedule/sync-review'
import { isPortApiCovered, isWarningCellText, searchCellText, sharedLaraRemark } from '@/features/vessel-search/search-columns'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  vessel: VesselRecord
  columnId: string
}>()

const STATUS_COLUMNS = new Set(['mappingStatus', 'lastSyncStatus'])
const unsettled = computed(() => showsUnsettledDash(props.vessel.matchingStatus, props.columnId))
const text = computed(() => unsettled.value ? '—' : searchCellText(props.vessel, props.columnId))
const voyageStatus = computed(() =>
  props.vessel.omit || props.vessel.voyageStatus === 'Omit' ? 'omit' : props.vessel.voyageStatus,
)
const covered = computed(() => isPortApiCovered(props.vessel))
</script>

<template>
  <span class="inline-flex items-center gap-1">
  <span v-if="columnId === 'mappingStatus'" class="inline-flex items-center gap-2">
    <StatusBadge :status="text" />
    <span
      v-if="vessel.matchingStatus === 'Multiple terminal records' && vessel.terminalCandidates.length"
      class="text-xs text-muted-foreground"
    >
      {{ vessel.terminalCandidates.length }} candidates
    </span>
    <span
      v-else-if="sharedLaraRemark(vessel.sharedLaraCount)"
      class="text-xs text-muted-foreground"
    >
      {{ sharedLaraRemark(vessel.sharedLaraCount) }}
    </span>
  </span>
  <span v-else-if="columnId === 'laraVoyage'" class="inline-flex flex-col items-start gap-1">
    <span :class="isWarningCellText(text, columnId) ? 'text-amber-800' : undefined">{{ text }}</span>
    <span class="inline-flex flex-wrap items-center gap-1">
      <StatusBadge :status="voyageStatus" size="sm" />
    </span>
  </span>
  <span v-else-if="columnId === 'pointCode'" class="inline-flex items-center gap-2">
    <span>{{ text }}</span>
    <CoverageIcon :covered="covered" />
  </span>
  <StatusBadge v-else-if="STATUS_COLUMNS.has(columnId)" :status="text" />
  <span v-else :class="isWarningCellText(text, columnId) ? 'text-amber-800' : undefined">{{ text }}</span>
  <SyncFieldAlert v-if="!unsettled" :schedule-id="vessel.id" :column-id="columnId" />
  </span>
</template>
