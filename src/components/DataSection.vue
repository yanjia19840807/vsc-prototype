<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  title?: string
  class?: HTMLAttributes['class']
  titleClass?: HTMLAttributes['class']
}>()
</script>

<template>
  <section data-slot="data-section" :class="cn('flex min-w-0 flex-col gap-1.5', props.class)">
    <div
      data-slot="data-section-title"
      :class="cn('flex items-center justify-between gap-2 text-sm font-medium text-foreground', props.titleClass)"
    >
      <div class="min-w-0">
        <slot name="title">
          <h2 class="text-sm font-medium">{{ title }}</h2>
        </slot>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>
