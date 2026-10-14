<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import StatusBadge from '@/components/StatusBadge.vue'
import { isWarningCellText, searchCellText } from '@/features/vessel-search/search-columns'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  vessel: VesselRecord
  columnId: string
}>()

const STATUS_COLUMNS = new Set(['mappingStatus', 'voyageStatus', 'tmlVslStatus'])
const text = computed(() => searchCellText(props.vessel, props.columnId))
</script>

<template>
  <span v-if="columnId === 'mappingStatus'" class="inline-flex items-center gap-2">
    <StatusBadge :status="text" />
    <span
      v-if="vessel.matchingStatus === 'Multiple terminal records' && vessel.terminalCandidates.length"
      class="text-xs text-muted-foreground"
    >
      {{ vessel.terminalCandidates.length }} candidates
    </span>
  </span>
  <StatusBadge v-else-if="STATUS_COLUMNS.has(columnId)" :status="text" />
  <RouterLink
    v-else-if="columnId === 'laraLink' && vessel.laraLinkTargetId && text !== '—'"
    class="text-primary underline underline-offset-2"
    :to="`/vessels/${vessel.laraLinkTargetId}/view`"
    @click.stop
  >
    {{ text }}
  </RouterLink>
  <span v-else :class="isWarningCellText(text, columnId) ? 'text-amber-800' : undefined">{{ text }}</span>
</template>
