<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('bg-card hover:bg-muted data-[state=selected]:bg-muted border-b transition-colors has-aria-expanded:bg-muted', props.class)"
  >
    <slot />
  </tr>
</template>
