<script setup lang="ts">
import { computed } from 'vue'

import StatusBadge from '@/components/StatusBadge.vue'
import { mappingStatusRemark } from '@/features/vessel-schedule/mapping-header'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  vessel: VesselRecord
}>()

const recordState = computed(() => (props.vessel.omit || props.vessel.voyageStatus === 'Omit' ? 'omit' : props.vessel.voyageStatus))
const remark = computed(() => mappingStatusRemark(props.vessel))
</script>

<template>
  <div>
    <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <StatusBadge :status="recordState" />
      <StatusBadge v-if="vessel.matchingStatus" :status="vessel.matchingStatus" />
      <span v-if="remark" class="text-xs text-muted-foreground">{{ remark }}</span>
    </div>
  </div>
</template>
