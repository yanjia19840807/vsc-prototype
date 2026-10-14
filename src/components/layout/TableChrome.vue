<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="
      cn(
        'flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3',
        $props.class,
      )
    "
  >
    <div class="min-w-0 flex-1">
      <slot name="legend" />
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
