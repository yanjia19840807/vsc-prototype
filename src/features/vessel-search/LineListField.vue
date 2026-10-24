<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from '@lucide/vue'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { lineListSummary, parseLineList } from '@/features/vessel-search/list-setting-model'

const props = defineProps<{
  label: string
  values: string[]
  placeholder: string
}>()

const emit = defineEmits<{
  'update:values': [value: string[]]
}>()

const open = ref(false)
const draft = ref('')

const summary = computed(() => lineListSummary(props.values, props.placeholder))

function openDialog() {
  draft.value = props.values.join('\n')
  open.value = true
}

function confirm() {
  emit('update:values', parseLineList(draft.value))
  open.value = false
}

function clearDraft() {
  draft.value = ''
}
</script>

<template>
  <div class="flex items-center gap-1">
    <div
      class="flex h-8 w-52 min-w-0 items-center rounded-lg border bg-card px-2.5 text-sm data-placeholder:bg-background"
      :data-placeholder="values.length ? undefined : ''"
      :class="values.length ? 'text-foreground' : 'text-muted-foreground'"
    >
      <span class="truncate">{{ summary }}</span>
    </div>
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      class="size-8"
      :aria-label="`Edit ${label}`"
      @click="openDialog"
    >
      <Plus class="size-3.5" />
    </Button>
    <Dialog v-model:open="open">
      <DialogContent size="md" class="gap-3">
        <DialogHeader>
          <DialogTitle class="text-sm">{{ label }}</DialogTitle>
        </DialogHeader>
        <Textarea
          v-model="draft"
          class="min-h-56 resize-y font-mono"
          :aria-label="label"
          placeholder="One value per line"
        />
        <DialogFooter>
          <Button type="button" variant="outline" class="sm:mr-auto" @click="clearDraft">Clear</Button>
          <Button type="button" variant="outline" @click="open = false">Cancel</Button>
          <Button type="button" variant="primary" @click="confirm">Ok</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
