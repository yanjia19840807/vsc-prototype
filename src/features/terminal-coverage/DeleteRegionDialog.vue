<script setup lang="ts">
import { computed } from 'vue'
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
import { regionLabel, type RegionRecord } from '@/features/terminal-coverage/model'
import { DIALOG_CONFIRM_DESCRIPTION } from '@/lib/dialog-copy'
import { useTerminalCoverageStore } from '@/stores/terminal-coverage'
import { useVesselStore } from '@/stores/vessels'

const props = defineProps<{
  open: boolean
  region: RegionRecord | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const coverage = useTerminalCoverageStore()
const vessels = useVesselStore()

const portCount = computed(() => {
  const code = props.region?.code
  if (!code) return 0
  return coverage.ports.filter((port) => port.regionCode === code).length
})

const vesselCount = computed(() => {
  const code = props.region?.code
  if (!code) return 0
  return vessels.vessels.filter((vessel) => vessel.region === code).length
})

const impact = computed(() => {
  if (!portCount.value && !vesselCount.value) return 'No ports or vessels use this region.'
  const ports = `${portCount.value} ${portCount.value === 1 ? 'port' : 'ports'}`
  const rows = `${vesselCount.value} ${vesselCount.value === 1 ? 'vessel' : 'vessels'}`
  return `This clears Region on ${ports} and ${rows}.`
})

function confirmDelete() {
  if (!props.region) return
  const code = props.region.code
  coverage.removeRegion(code)
  vessels.clearRegion(code)
  toast.success('Region deleted')
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>Delete region</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        {{ region ? regionLabel(region) : 'This region' }}. {{ impact }}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
        <Button type="button" variant="destructive" @click="confirmDelete">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
