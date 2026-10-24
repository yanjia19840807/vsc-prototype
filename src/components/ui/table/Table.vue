<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    /** False when an ancestor is the scrollport, so sticky headers are not trapped here. */
    scrollable?: boolean
  }>(),
  { scrollable: true },
)
</script>

<template>
  <div
    data-slot="table-container"
    :class="cn('relative w-full max-w-full min-w-0', props.scrollable && 'overflow-x-auto')"
  >
    <table data-slot="table" :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
