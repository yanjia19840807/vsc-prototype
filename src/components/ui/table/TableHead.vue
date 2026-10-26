<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed, inject } from 'vue'
import { cn } from '@/lib/utils'
import { tableHeaderPinnedKey } from './context'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const pinned = inject(tableHeaderPinnedKey, computed(() => false))
</script>

<template>
  <th
    data-slot="table-head"
    :class="cn(
      'text-foreground h-10 bg-card px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0',
      pinned && 'sticky top-0 z-30',
      props.class,
    )"
  >
    <slot />
  </th>
</template>
