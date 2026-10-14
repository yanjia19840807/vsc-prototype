<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    :class="
      cn(
        'flex min-w-0 max-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2',
        props.class,
      )
    "
  >
    <div class="min-w-0 shrink">
      <slot name="breadcrumb" />
    </div>
    <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
      <slot />
    </div>
  </div>
</template>
