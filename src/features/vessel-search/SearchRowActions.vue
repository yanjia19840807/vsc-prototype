<script setup lang="ts">
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import { useScheduleStore } from '@/stores/schedule'
import type { VesselRecord } from '@/types/vsc'

const props = defineProps<{
  vessel: VesselRecord
}>()

const emit = defineEmits<{
  view: []
  review: []
  history: []
}>()

const schedule = useScheduleStore()
const canReview = computed(() => schedule.needsReview(props.vessel.id))
</script>

<template>
  <div class="flex items-center gap-1">
    <Button type="button" size="xs" variant="outline" @click="emit('view')">View</Button>
    <Button
      type="button"
      size="xs"
      variant="outline"
      :disabled="!canReview"
      @click="emit('review')"
    >
      Review
    </Button>
    <Button type="button" size="xs" variant="outline" @click="emit('history')">Activity logs</Button>
  </div>
</template>
