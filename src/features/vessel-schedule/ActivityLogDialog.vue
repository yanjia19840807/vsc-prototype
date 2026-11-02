<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ActivityLogBrowser from '@/features/vessel-schedule/ActivityLogBrowser.vue'
import { ACTIVITY_LOG_DIALOG_CLASS } from '@/features/vessel-schedule/wide-dialog'
import type { VesselRecord } from '@/types/vsc'

defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent v-if="vessel" size="2xl" :class="ACTIVITY_LOG_DIALOG_CLASS">
      <DialogHeader class="shrink-0">
        <DialogTitle>Activity logs</DialogTitle>
        <DialogDescription>{{ vessel.pointCode }} · {{ vessel.laraVoyage }}</DialogDescription>
      </DialogHeader>
      <ActivityLogBrowser class="min-h-0 flex-1" bounded :vessel="vessel" />
      <DialogFooter class="shrink-0">
        <Button type="button" variant="outline" @click="emit('update:open', false)">Close</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
