<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { provide, toRef } from 'vue'
import { cn } from '@/lib/utils'
import { tableHeaderPinnedKey } from './context'

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    /** Pin the header while a full-page table scrolls. */
    pinned?: boolean
  }>(),
  { pinned: false },
)

provide(tableHeaderPinnedKey, toRef(props, 'pinned'))
</script>

<template>
  <thead
    data-slot="table-header"
    :class="cn('[&_tr]:border-b', props.pinned && 'sticky top-0 z-30', props.class)"
  >
    <slot />
  </thead>
</template>
