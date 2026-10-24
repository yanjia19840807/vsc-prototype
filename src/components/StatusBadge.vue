<script setup lang="ts">
import { computed } from 'vue'

import { Badge } from '@/components/ui/badge'
import type { BadgeVariants } from '@/components/ui/badge'

const props = defineProps<{
  status: string
  size?: BadgeVariants['size']
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
      'Linked',
      'Active',
      'Available',
      'Manual Matched',
      'Manual matched',
      'Auto matched',
    ].includes(status)
  ) {
    return 'success'
  }
  // Terminal schedule status (Feituo) — uniform info, not match semantics
  if (['计划', '在港', '离港'].includes(status)) return 'info'
  if (status === 'omit' || status === 'Omit') return 'muted'
  if (
    [
      'Multiple terminal records',
      'ETD gap > 3 days',
      'No external voyage',
      'No terminal record',
    ].includes(status)
  ) {
    return 'warning'
  }
  if (status.startsWith('No ')) return 'destructive'
  return 'secondary'
})
</script>

<template>
  <Badge v-if="variant" :variant="variant" :size="size">{{ status }}</Badge>
  <span v-else-if="isWarningText" class="text-amber-800">{{ status }}</span>
  <template v-else>{{ status }}</template>
</template>
