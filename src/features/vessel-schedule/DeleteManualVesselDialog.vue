<script setup lang="ts">
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  deleted: []
}>()

const store = useVesselStore()

function confirmDelete() {
  if (!props.vessel) return
  const ok = store.removeManualVessel(props.vessel.id)
  if (!ok) {
    toast.error('Only unlinked manual vessels can be deleted')
    return
  }
  toast.success('Vessel deleted')
  emit('deleted')
  emit('update:open', false)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Delete vessel</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Remove this manually created schedule row. Delete is only allowed before the row is linked to a formal LARA voyage.
      </p>
      <p v-if="vessel" class="text-sm text-muted-foreground">
        {{ vessel.vesselName }} · {{ vessel.pointCode }} · {{ vessel.laraVoyage || '—' }}
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="destructive" @click="confirmDelete">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
