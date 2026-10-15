<script setup lang="ts">
import { computed } from 'vue'

import { Badge } from '@/components/ui/badge'
import type { BadgeVariants } from '@/components/ui/badge'

const props = defineProps<{
  status: string
}>()

const isWarningText = computed(() => {
  const status = props.status.trim()
  return status === 'Unconfirmed' || status === 'Not found' || status === 'Not Found'
})

const variant = computed<BadgeVariants['variant'] | null>(() => {
  const status = props.status.trim()
  if (!status || status === '—' || isWarningText.value) return null
  if (
    [
      'Matched',
      'Active',
      'Available',
      'Manual Matched',
      'Manual matched',
      'Auto matched',
      'Multiple LARA → one terminal',
      'Multiple LARA records',
    ].includes(status)
  ) {
    return 'success'
  }
  // Terminal schedule status (Feituo) — uniform info, not match semantics
  if (['计划', '在港', '离港', 'Linked'].includes(status)) return 'info'
  if (status === 'omit' || status === 'Omit') return 'muted'
  if (
    [
      'Multiple terminal records',
      'ETD gap > 5 days',
      'No external voyage',
      'No terminal record',
      'Pending match',
    ].includes(status)
  ) {
    return 'warning'
  }
  if (status.startsWith('No ')) return 'destructive'
  return 'secondary'
})
</script>

<template>
  <Badge v-if="variant" :variant="variant">{{ status }}</Badge>
  <span v-else-if="isWarningText" class="text-amber-800">{{ status }}</span>
  <template v-else>{{ status }}</template>
</template>
