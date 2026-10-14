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
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
  }>(),
  {
    confirmLabel: 'Delete',
  },
)

const emit = defineEmits<{
  confirm: []
}>()

function confirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <Dialog :open="open" @update:open="open = $event">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p v-if="description" class="text-sm">{{ description }}</p>
      <slot />
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">Cancel</Button>
        <Button type="button" variant="destructive" @click="confirm">{{ confirmLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
