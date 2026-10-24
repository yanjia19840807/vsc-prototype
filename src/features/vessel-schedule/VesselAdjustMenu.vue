<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import {
  canDeleteManualVessel,
  canEditManualVessel,
} from '@/features/vessel-schedule/manual-vessel-actions'
import {
  mismatchActionForVessel,
  mismatchActionLabel,
  type ScheduleQuickAction,
} from '@/features/vessel-schedule/mismatch-actions'
import type { VesselRecord } from '@/types/vsp'

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

const router = useRouter()
const mismatchAction = computed(() => (props.hideMismatch || props.vessel.createdManually ? null : mismatchActionForVessel(props.vessel)))
const mismatchLabel = computed(() => (mismatchAction.value ? mismatchActionLabel(props.vessel) : null))
const showTemporaryReview = computed(() => !props.hideMismatch && Boolean(props.vessel.createdManually))
const canEdit = computed(() => props.hideMismatch && canEditManualVessel(props.vessel))
const canDelete = computed(() => props.hideMismatch && canDeleteManualVessel(props.vessel))
const show = computed(
  () => showTemporaryReview.value || canEdit.value || canDelete.value || Boolean(mismatchAction.value) || Boolean(props.vessel.linkReview),
)

function openReview() {
  void router.push(`/vessels/${props.vessel.id}/review`)
}
</script>

<template>
  <div v-if="show" class="flex flex-wrap items-center gap-1">
    <Button v-if="showTemporaryReview" type="button" variant="outline" :size="size" @click="openReview">
      Review
    </Button>
    <Button
      v-else-if="vessel.linkReview && !hideMismatch && !mismatchAction"
      type="button"
      variant="outline"
      :size="size"
      @click="emit('pick', 'linkReview')"
    >
      Review
    </Button>
    <Button
      v-if="mismatchAction"
      type="button"
      variant="outline"
      :size="size"
      @click="emit('pick', mismatchAction)"
    >
      {{ mismatchLabel }}
    </Button>
    <Button v-if="canEdit" type="button" variant="outline" :size="size" @click="emit('pick', 'editVessel')">
      Edit vessel
    </Button>
    <Button v-if="canDelete" type="button" variant="destructive" :size="size" @click="emit('pick', 'deleteVessel')">
      Delete
    </Button>
  </div>
</template>
