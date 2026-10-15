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
import type { PortCoverage } from '@/features/terminal-coverage/model'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'

const props = defineProps<{
  open: boolean
  port: PortCoverage | null
  mode: 'delete' | 'deactivate'
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useTerminalCoverageStore()

function confirm() {
  if (!props.port) return
  if (props.mode === 'deactivate') {
    store.setPortActive(props.port.portCode, false)
    toast.success('Port deactivated')
  } else {
    store.remove(props.port.portCode)
    toast.success('Port deleted')
  }
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{{ mode === 'deactivate' ? 'Deactivate port' : 'Delete port' }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        {{
          mode === 'deactivate'
            ? 'This port stays on existing vessel rows. It is left out of new filters.'
            : 'Delete this port and every terminal row under it.'
        }}
      </p>
      <p v-if="port" class="text-sm text-muted-foreground">
        {{ port.portCode }} · {{ port.portName }} · {{ port.terminals.length }} terminals
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button type="button" :variant="mode === 'deactivate' ? 'primary' : 'destructive'" @click="confirm">
          {{ mode === 'deactivate' ? 'Deactivate' : 'Delete' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
