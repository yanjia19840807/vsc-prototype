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
  mode: 'delete' | 'deactivate'
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
  if (props.mode === 'deactivate') {
    return 'Existing ports and vessels keep this region. It is left out of new filters.'
  }
  if (!portCount.value && !vesselCount.value) return 'No ports or vessels use this region.'
  return 'This region is still in use.'
})

function confirm() {
  if (!props.region) return
  if (props.mode === 'deactivate') {
    coverage.setRegionActive(props.region.code, false)
    toast.success('Region deactivated')
  } else {
    coverage.removeRegion(props.region.code)
    toast.success('Region deleted')
  }
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent size="sm">
      <DialogHeader>
        <DialogTitle>{{ mode === 'deactivate' ? 'Deactivate region' : 'Delete region' }}</DialogTitle>
        <DialogDescription>{{ DIALOG_CONFIRM_DESCRIPTION }}</DialogDescription>
      </DialogHeader>
      <p class="text-sm">
        {{ region ? regionLabel(region) : 'This region' }}. {{ impact }}
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
