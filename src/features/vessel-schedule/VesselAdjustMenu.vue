<script setup lang="ts">
import { computed } from 'vue'

import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import {
  canDeleteManualVessel,
  canEditManualVessel,
  canLinkManualVessel,
  canUnlinkManualVessel,
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
  }>(),
  { size: 'xs' },
)

const emit = defineEmits<{
  pick: [action: ScheduleQuickAction]
}>()

const mismatchAction = computed(() => mismatchActionForVessel(props.vessel))
const mismatchLabel = computed(() => mismatchActionLabel(props.vessel))
const canEdit = computed(() => canEditManualVessel(props.vessel))
const canLink = computed(() => canLinkManualVessel(props.vessel))
const canUnlink = computed(() => canUnlinkManualVessel(props.vessel))
const canDelete = computed(() => canDeleteManualVessel(props.vessel))
const show = computed(
  () => canEdit.value || canLink.value || canUnlink.value || canDelete.value || Boolean(mismatchAction.value),
)
</script>

<template>
  <div v-if="show" class="flex flex-wrap items-center gap-1">
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
    <Button v-if="canLink" type="button" variant="outline" :size="size" @click="emit('pick', 'linkLara')">
      Link
    </Button>
    <Button v-if="canUnlink" type="button" variant="outline" :size="size" @click="emit('pick', 'unlinkLara')">
      Unlink LARA
    </Button>
    <Button v-if="canDelete" type="button" variant="destructive" :size="size" @click="emit('pick', 'deleteVessel')">
      Delete
    </Button>
  </div>
</template>
