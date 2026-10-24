<script setup lang="ts">
import { computed } from 'vue'

import StatusBadge from '@/components/StatusBadge.vue'
import { mappingStatusRemark } from '@/features/vessel-schedule/mapping-header'
import TemporaryMark from '@/features/vessel-schedule/TemporaryMark.vue'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  vessel: VesselRecord
}>()

const remark = computed(() => mappingStatusRemark(props.vessel))
const recordState = computed(() => (props.vessel.omit || props.vessel.voyageStatus === 'Omit' ? 'omit' : props.vessel.voyageStatus))
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold">{{ vessel.vesselName }}</h1>
    <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <StatusBadge :status="vessel.matchingStatus" />
      <span v-if="remark" class="text-xs text-muted-foreground">{{ remark }}</span>
      <TemporaryMark v-if="vessel.createdManually" />
      <StatusBadge :status="recordState" />
    </div>
  </div>
</template>
