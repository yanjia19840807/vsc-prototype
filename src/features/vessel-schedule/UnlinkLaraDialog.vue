<script setup lang="ts">
import { ref, watch } from 'vue'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { laraLinkKey } from '@/features/vessel-schedule/lara-link'
import { useVesselStore } from '@/stores/vessels'
import type { VesselRecord } from '@/types/vsp'

const props = defineProps<{
  open: boolean
  vessel: VesselRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useVesselStore()
const remark = ref('')

const target = () => {
  const id = props.vessel?.laraLinkTargetId
  return id ? store.byId(id) : undefined
}

watch(
  () => [props.open, props.vessel?.id] as const,
  ([open]) => {
    if (open) remark.value = ''
  },
)

function confirmUnlink() {
  if (!props.vessel) return
  const ok = store.unlinkManualVesselFromLara(props.vessel.id, { reason: remark.value.trim() })
  if (!ok) {
    toast.error('Unable to remove this LARA link')
    return
  }
  toast.success('LARA link removed')
  emit('update:open', false)
}

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="md">
      <DialogHeader>
        <DialogTitle>Unlink LARA</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        Remove the link. The target record returns to its previous mapping status, and Sync and Adjust become available again.
      </p>
      <p v-if="vessel" class="text-sm text-muted-foreground">
        {{ vessel.vesselName }} · {{ target() ? laraLinkKey(target()!) : '—' }}
      </p>

      <Field>
        <FieldLabel>Remark</FieldLabel>
        <Textarea
          :model-value="remark"
          placeholder="Why this LARA link is removed"
          @update:model-value="remark = String($event)"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" @click="close">Cancel</Button>
        <Button type="button" variant="primary" @click="confirmUnlink">Save</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
