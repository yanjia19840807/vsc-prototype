<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import type { MatchingStatus } from '@/types/vsc'

const props = defineProps<{
  status: MatchingStatus
}>()

function tone(status: string) {
  if (status.includes('Auto') || status === 'Matched' || status === 'Manual matched') {
    return 'default' as const
  }
  if (status.includes('Review') || status.includes('Multiple')) return 'outline' as const
  if (status.includes('No ')) return 'destructive' as const
  return 'secondary' as const
}
</script>

<template>
  <!-- Official Badge is a single-line pill (h-5 + whitespace-nowrap); do not force multi-line wrap. -->
  <Badge :variant="tone(props.status)">
    {{ status }}
  </Badge>
</template>
