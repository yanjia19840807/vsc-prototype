<script setup lang="ts">
import { Button } from '@/components/ui/button'
import VesselAdjustMenu from '@/features/vessel-schedule/VesselAdjustMenu.vue'
import type { ScheduleQuickAction } from '@/features/vessel-schedule/mismatch-actions'
import type { VesselRecord } from '@/types/vsp'

defineProps<{
  vessel: VesselRecord
}>()

const emit = defineEmits<{
  view: []
  quick: [action: ScheduleQuickAction]
  history: []
}>()
</script>

<template>
  <div class="flex items-center gap-1">
    <Button type="button" size="xs" variant="outline" @click="emit('view')">View</Button>
    <VesselAdjustMenu :vessel="vessel" variant="secondary" @pick="emit('quick', $event)" />
    <Button type="button" size="xs" variant="outline" @click="emit('history')">Activity logs</Button>
  </div>
</template>
