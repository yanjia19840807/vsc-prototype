<script setup lang="ts">
import { computed } from 'vue'

import StatusBadge from '@/components/StatusBadge.vue'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  vessel: VesselRecord
}>()

const recordState = computed(() => (props.vessel.omit || props.vessel.voyageStatus === 'Omit' ? 'omit' : props.vessel.voyageStatus))
</script>

<template>
  <div>
    <p class="text-sm text-muted-foreground">{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</p>
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <StatusBadge :status="recordState" />
    </div>
  </div>
</template>
