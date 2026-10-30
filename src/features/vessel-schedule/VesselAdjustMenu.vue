<script setup lang="ts">
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import {
  mismatchActionForVessel,
  type ScheduleQuickAction,
} from '@/features/vessel-schedule/mismatch-actions'
import { useScheduleStore } from '@/stores/schedule'
import type { VesselRecord } from '@/types/vsc'

const props = withDefaults(
  defineProps<{
    vessel: VesselRecord
    size?: ButtonVariants['size']
    /** Review is already open, so the shortcut that leads here stays off this page. */
    hideMismatch?: boolean
  }>(),
  { size: 'xs', hideMismatch: false },
)

const emit = defineEmits<{
  pick: [action: ScheduleQuickAction]
}>()

const schedule = useScheduleStore()
const canReview = computed(() => schedule.needsReview(props.vessel.id))
const mismatchAction = computed(() => mismatchActionForVessel(props.vessel) ?? 'reviewMatch')

function openReview() {
  if (!canReview.value) return
  emit('pick', mismatchAction.value)
}
</script>

<template>
  <div v-if="!hideMismatch" class="flex flex-wrap items-center gap-1">
    <Button
      type="button"
      variant="outline"
      :size="size"
      :disabled="!canReview"
      @click="openReview"
    >
      Review
    </Button>
  </div>
</template>
