<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDownIcon } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import type { ButtonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    variant?: ButtonVariants['variant']
  }>(),
  { size: 'xs', variant: 'outline' },
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
  <DropdownMenu v-if="show">
    <DropdownMenuTrigger as-child>
      <Button type="button" :variant="variant" :size="size">
        Adjust
        <ChevronDownIcon />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-auto min-w-40"
      :class="size === 'xs' ? '[&_[data-slot=dropdown-menu-item]]:text-xs' : undefined"
    >
      <DropdownMenuGroup>
        <DropdownMenuItem v-if="mismatchAction" @select="emit('pick', mismatchAction!)">
          {{ mismatchLabel }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canEdit" @select="emit('pick', 'editVessel')">
          Edit vessel
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canLink" @select="emit('pick', 'linkLara')">
          Link to LARA
        </DropdownMenuItem>
        <DropdownMenuItem v-if="canUnlink" @select="emit('pick', 'unlinkLara')">
          Unlink LARA
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <template v-if="canDelete">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="emit('pick', 'deleteVessel')">
          Delete
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
